import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../database/prisma.service';
import { ChatService } from './chat.service';

@WebSocketGateway({ namespace: '/chat', cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  // Live presence: who is watching each room RIGHT NOW, keyed by socket id.
  // This is the display source of truth — it self-heals on disconnect (no ghost
  // viewers), unlike the RoomParticipant table (historical watch-time/ranking).
  // ponytail: in-memory, single-instance + counts connections not unique users;
  // move to a Redis adapter / dedupe by userId when the API scales horizontally.
  private readonly viewers = new Map<string, Set<string>>();

  constructor(
    private readonly chat: ChatService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  // Current live viewer count for one room.
  countFor(roomId: string): number {
    return this.viewers.get(roomId)?.size ?? 0;
  }

  // Counts for many rooms at once (feed/search). Rooms with no viewers are 0.
  countsFor(roomIds: string[]): Map<string, number> {
    return new Map(roomIds.map((id) => [id, this.countFor(id)]));
  }

  private addViewer(roomId: string, socketId: string) {
    const set = this.viewers.get(roomId) ?? new Set<string>();
    set.add(socketId);
    this.viewers.set(roomId, set);
  }

  // Removes a socket from a room; returns true if the room's count changed.
  private removeViewer(roomId: string, socketId: string): boolean {
    const set = this.viewers.get(roomId);
    if (!set || !set.delete(socketId)) return false;
    if (set.size === 0) this.viewers.delete(roomId);
    return true;
  }

  private broadcastCount(roomId: string) {
    this.server?.to(roomId).emit('room.viewer_count_updated', { roomId, count: this.countFor(roomId) });
  }

  // Lets HTTP services/controllers (gifts, room-end, mute/delete) push events
  // into a live room. Realtime is an optional layer: if the socket server isn't
  // up yet (e.g. unit tests, boot race) this must NOT break the core action.
  emitToRoom(roomId: string, event: string, payload: unknown) {
    this.server?.to(roomId).emit(event, payload);
  }

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token || client.handshake.query?.token;
    try {
      const payload = this.jwt.verify(String(token), { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET') });
      client.data.user = payload;
    } catch {
      client.disconnect(true);
    }
  }

  // Socket.IO clears room membership on disconnect, but our presence map is
  // separate — sweep this socket out of every room it was counted in.
  handleDisconnect(client: Socket) {
    for (const roomId of [...this.viewers.keys()]) {
      if (this.removeViewer(roomId, client.id)) this.broadcastCount(roomId);
    }
  }

  @SubscribeMessage('room.join')
  async join(@ConnectedSocket() client: Socket, @MessageBody() body: { roomId: string }) {
    await client.join(body.roomId);
    this.addViewer(body.roomId, client.id);
    this.broadcastCount(body.roomId);
    const count = this.countFor(body.roomId);
    // Record a new concurrent-viewer peak when it grows. Conditional updateMany
    // is race-safe and needs no read — and survives restarts (in-memory presence
    // resets to 0, but the stored peak only ever moves up). Non-critical: a
    // failure must not break joining.
    this.prisma.liveRoom
      .updateMany({ where: { id: body.roomId, peakViewers: { lt: count } }, data: { peakViewers: count } })
      .catch(() => {});
    return { ok: true, count };
  }

  @SubscribeMessage('room.leave')
  async leave(@ConnectedSocket() client: Socket, @MessageBody() body: { roomId: string }) {
    await client.leave(body.roomId);
    if (this.removeViewer(body.roomId, client.id)) this.broadcastCount(body.roomId);
    return { ok: true, count: this.countFor(body.roomId) };
  }

  @SubscribeMessage('chat.message')
  async message(@ConnectedSocket() client: Socket, @MessageBody() body: { roomId: string; message: string; clientMessageId?: string }) {
    const saved = await this.chat.createMessage(client.data.user.sub, body.roomId, body.message);
    this.server.to(body.roomId).emit('chat.message_created', saved);
    return { ok: true, messageId: saved.id, clientMessageId: body.clientMessageId };
  }

  @SubscribeMessage('reaction.sent')
  async reaction(@ConnectedSocket() client: Socket, @MessageBody() body: { roomId: string; reactionType: string }) {
    this.server.to(body.roomId).emit('reaction.sent', { roomId: body.roomId, userId: client.data.user.sub, reactionType: body.reactionType });
    return { ok: true };
  }
}
