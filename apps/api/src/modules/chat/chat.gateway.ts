import { Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../database/prisma.service';
import { ChatService } from './chat.service';
import { RoomBroadcast, RoomEvents, RoomPresence } from './room-events';

@WebSocketGateway({ namespace: '/chat', cors: { origin: '*' } })
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy, RoomBroadcast, RoomPresence
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private redisPub?: Redis;
  private redisSub?: Redis;

  // Live presence: who is watching each room RIGHT NOW, keyed by socket id.
  // This is the display source of truth — it self-heals on disconnect (no ghost
  // viewers), unlike the RoomParticipant table (historical watch-time/ranking).
  // ponytail: presence stays PER-INSTANCE (counts this node's connections, not
  // unique users) even with the Redis adapter below; cross-instance counts need
  // adapter-aware fetchSockets() or Redis-backed presence when we scale out.
  private readonly viewers = new Map<string, Set<string>>();

  // When each socket joined each room, keyed `${roomId}::${socketId}`. Used to
  // accumulate real watch-time into LiveRoom.totalWatchSeconds on leave/disconnect.
  private readonly joinedAt = new Map<string, number>();

  // Seam for deterministic tests; production reads the wall clock.
  protected now(): number {
    return Date.now();
  }

  constructor(
    private readonly chat: ChatService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  // Attach the Socket.IO Redis adapter so to(room).emit / emitToRoom fan out
  // across every API instance, not just the one holding the socket (R5 §9 #2).
  // Realtime is an optional layer (Rule 9): if Redis is misconfigured the API
  // still boots single-instance — logged loudly, never fatal. Disable with
  // CHAT_REDIS_ADAPTER=off (e.g. one-off local runs without Redis).
  afterInit(server: Server) {
    if (process.env.CHAT_REDIS_ADAPTER === 'off') {
      this.logger.warn('Chat Redis adapter disabled (CHAT_REDIS_ADAPTER=off) — events fan out on this instance only');
      return;
    }
    try {
      const url = process.env.REDIS_URL || 'redis://localhost:6379';
      this.redisPub = new Redis(url);
      this.redisSub = this.redisPub.duplicate();
      // Surface adapter connection problems instead of unhandled 'error' events.
      this.redisPub.on('error', (err) => this.logger.error(`Chat Redis pub error: ${err.message}`));
      this.redisSub.on('error', (err) => this.logger.error(`Chat Redis sub error: ${err.message}`));
      // Namespaced gateways receive the Namespace here, which has no adapter
      // setter — attach on the parent Server, which re-inits the adapter on
      // every existing namespace (including /chat).
      const io: any = (server as any).server ?? server;
      io.adapter(createAdapter(this.redisPub, this.redisSub));
      this.logger.log('Chat Redis adapter attached — room events fan out across instances');
    } catch (err: any) {
      this.logger.error(`Chat Redis adapter failed to attach (single-instance fan-out only): ${err?.message}`);
    }
  }

  async onModuleDestroy() {
    await this.redisPub?.quit().catch(() => {});
    await this.redisSub?.quit().catch(() => {});
  }

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

  private watchKey(roomId: string, socketId: string): string {
    return `${roomId}::${socketId}`;
  }

  // Roll this socket's elapsed time in the room into LiveRoom.totalWatchSeconds.
  // Best-effort and conditional (updateMany, not update) so a since-deleted room
  // or a DB hiccup never breaks leave/disconnect handling.
  private finalizeWatch(roomId: string, socketId: string) {
    const key = this.watchKey(roomId, socketId);
    const start = this.joinedAt.get(key);
    if (start === undefined) return;
    this.joinedAt.delete(key);
    const seconds = Math.floor((this.now() - start) / 1000);
    if (seconds <= 0) return;
    this.prisma.liveRoom
      .updateMany({ where: { id: roomId }, data: { totalWatchSeconds: { increment: BigInt(seconds) } } })
      .catch((err) => this.logger.warn(`finalizeWatch failed for room ${roomId} (+${seconds}s lost): ${err?.message}`));
  }

  // Lets HTTP services/controllers (gifts, room-end, mute/delete) push events
  // into a live room. Realtime is an optional layer: if the socket server isn't
  // up yet (e.g. unit tests, boot race) this must NOT break the core action.
  // RoomBroadcast: the ONLY way non-chat modules put events on the wire —
  // event names and payloads are typed by the RoomEvents map.
  emit<K extends keyof RoomEvents>(roomId: string, event: K, payload: RoomEvents[K]) {
    this.server?.to(roomId).emit(event, payload);
  }

  // RoomPresence
  viewerCount(roomId: string): number {
    return this.countFor(roomId);
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
      this.finalizeWatch(roomId, client.id);
      if (this.removeViewer(roomId, client.id)) this.broadcastCount(roomId);
    }
  }

  @SubscribeMessage('room.join')
  async join(@ConnectedSocket() client: Socket, @MessageBody() body: { roomId: string }) {
    await client.join(body.roomId);
    this.addViewer(body.roomId, client.id);
    this.joinedAt.set(this.watchKey(body.roomId, client.id), this.now());
    this.broadcastCount(body.roomId);
    const count = this.countFor(body.roomId);
    // Record a new concurrent-viewer peak when it grows. Conditional updateMany
    // is race-safe and needs no read — and survives restarts (in-memory presence
    // resets to 0, but the stored peak only ever moves up). Non-critical: a
    // failure must not break joining.
    this.prisma.liveRoom
      .updateMany({ where: { id: body.roomId, peakViewers: { lt: count } }, data: { peakViewers: count } })
      .catch((err) => this.logger.warn(`peakViewers update failed for room ${body.roomId}: ${err?.message}`));
    return { ok: true, count };
  }

  @SubscribeMessage('room.leave')
  async leave(@ConnectedSocket() client: Socket, @MessageBody() body: { roomId: string }) {
    await client.leave(body.roomId);
    this.finalizeWatch(body.roomId, client.id);
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
