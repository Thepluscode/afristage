import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ChatMessageStatus, RoomStatus, UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

type Actor = { sub: string; role: UserRole };
const PRIVILEGED: UserRole[] = [UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN];

@Injectable()
export class ChatService {
  // ponytail: in-memory per-(room,user) sliding window. Per-instance only — move to
  // Redis if chat runs on more than one node. Bounded: pruned to the window each call.
  private readonly recent = new Map<string, number[]>();

  constructor(private readonly prisma: PrismaService) {}

  private checkRate(roomId: string, userId: string) {
    const limit = Number(process.env.CHAT_RATE_LIMIT || 5);
    const windowMs = Number(process.env.CHAT_RATE_WINDOW_MS || 5000);
    const key = `${roomId}:${userId}`;
    const now = Date.now();
    const hits = (this.recent.get(key) || []).filter((t) => now - t < windowMs);
    if (hits.length >= limit) {
      this.recent.set(key, hits);
      throw new BadRequestException('You are sending messages too fast');
    }
    hits.push(now);
    this.recent.set(key, hits);
  }

  async createMessage(userId: string, roomId: string, message: string) {
    if (!message.trim() || message.length > 500) throw new BadRequestException('Invalid message');

    // Banned/suspended users keep a valid token until it expires — block them at send time.
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== UserStatus.ACTIVE) throw new ForbiddenException('User is not active');

    const room = await this.prisma.liveRoom.findUnique({ where: { id: roomId } });
    if (!room || room.status !== RoomStatus.LIVE) throw new BadRequestException('Room is not live');

    const mute = await this.prisma.roomMute.findUnique({ where: { roomId_userId: { roomId, userId } } });
    if (mute && mute.mutedUntil > new Date()) throw new ForbiddenException('You are muted in this room');

    this.checkRate(roomId, userId);

    return this.prisma.chatMessage.create({
      data: { roomId, senderId: userId, message },
      include: { sender: { include: { profile: true } } }
    });
  }

  // Only the room host or a moderator/admin can moderate a room's chat.
  private async assertCanModerate(actor: Actor, roomId: string) {
    const room = await this.prisma.liveRoom.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');
    if (room.hostUserId === actor.sub) return room;
    if (PRIVILEGED.includes(actor.role)) return room;
    throw new ForbiddenException('Not allowed to moderate this room');
  }

  async mute(actor: Actor, roomId: string, userId: string, seconds = 600, reason?: string) {
    await this.assertCanModerate(actor, roomId);
    const mutedUntil = new Date(Date.now() + seconds * 1000);
    await this.prisma.roomMute.upsert({
      where: { roomId_userId: { roomId, userId } },
      create: { roomId, userId, mutedUntil, mutedBy: actor.sub },
      update: { mutedUntil, mutedBy: actor.sub }
    });
    // Auditable moderation action (so mutes are reviewable, not just ephemeral state).
    await this.prisma.moderationAction.create({
      data: { moderatorId: actor.sub, roomId, targetUserId: userId, action: 'USER_MUTED_IN_ROOM', reason }
    });
    await this.prisma.adminAuditLog.create({
      data: { actorId: actor.sub, action: 'room.user_muted', target: roomId, metadata: { userId, durationSeconds: seconds, reason: reason ?? null } }
    });
    return { roomId, userId, mutedUntil, durationSeconds: seconds };
  }

  async unmute(actor: Actor, roomId: string, userId: string) {
    await this.assertCanModerate(actor, roomId);
    await this.prisma.roomMute.deleteMany({ where: { roomId, userId } });
    return { roomId, userId, muted: false };
  }

  async deleteMessage(actor: Actor, roomId: string, messageId: string) {
    await this.assertCanModerate(actor, roomId);
    const msg = await this.prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!msg || msg.roomId !== roomId) throw new NotFoundException('Message not found');
    await this.prisma.chatMessage.update({ where: { id: messageId }, data: { status: ChatMessageStatus.HIDDEN_BY_MODERATOR } });
    return { messageId, roomId, status: ChatMessageStatus.HIDDEN_BY_MODERATOR };
  }

  // Only VISIBLE messages are ever returned — deleted/hidden ones disappear.
  listMessages(roomId: string) {
    return this.prisma.chatMessage.findMany({
      where: { roomId, status: ChatMessageStatus.VISIBLE },
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: { sender: { include: { profile: true } } }
    });
  }
}
