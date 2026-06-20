import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ConnectedSocket, MessageBody, OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

@WebSocketGateway({ namespace: '/chat', cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly chat: ChatService, private readonly jwt: JwtService, private readonly config: ConfigService) {}

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

  @SubscribeMessage('room.join')
  async join(@ConnectedSocket() client: Socket, @MessageBody() body: { roomId: string }) {
    await client.join(body.roomId);
    client.to(body.roomId).emit('room.viewer_count_updated', { roomId: body.roomId });
    return { ok: true };
  }

  @SubscribeMessage('room.leave')
  async leave(@ConnectedSocket() client: Socket, @MessageBody() body: { roomId: string }) {
    await client.leave(body.roomId);
    return { ok: true };
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
