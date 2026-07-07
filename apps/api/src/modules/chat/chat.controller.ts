import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';

@UseGuards(JwtAuthGuard)
@Controller('live-rooms')
export class ChatController {
  constructor(private readonly chat: ChatService, private readonly gateway: ChatGateway) {}

  @Get(':id/messages')
  messages(@Param('id') roomId: string) {
    return this.chat.listMessages(roomId);
  }

  @Post(':id/mute/:userId')
  async mute(
    @CurrentUser() user: any,
    @Param('id') roomId: string,
    @Param('userId') userId: string,
    @Body('seconds') seconds?: number,
    @Body('reason') reason?: string
  ) {
    const result = await this.chat.mute(user, roomId, userId, seconds, reason);
    this.gateway.emit(roomId, 'user.muted', { roomId, userId, durationSeconds: result.durationSeconds });
    return result;
  }

  @Post(':id/unmute/:userId')
  unmute(@CurrentUser() user: any, @Param('id') roomId: string, @Param('userId') userId: string) {
    return this.chat.unmute(user, roomId, userId);
  }

  @Delete(':id/messages/:messageId')
  async deleteMessage(@CurrentUser() user: any, @Param('id') roomId: string, @Param('messageId') messageId: string) {
    const result = await this.chat.deleteMessage(user, roomId, messageId);
    this.gateway.emit(roomId, 'chat.deleted', { roomId, messageId });
    return result;
  }
}
