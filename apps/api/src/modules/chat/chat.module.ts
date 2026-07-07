import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ChatGateway } from './chat.gateway';
import { RoomBroadcast, RoomPresence } from './room-events';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';

@Module({ imports: [JwtModule.register({})], controllers: [ChatController], providers: [
    ChatGateway,
    ChatService,
    { provide: RoomBroadcast, useExisting: ChatGateway },
    { provide: RoomPresence, useExisting: ChatGateway }
  ],
  exports: [ChatGateway, RoomBroadcast, RoomPresence]
})
export class ChatModule {}
