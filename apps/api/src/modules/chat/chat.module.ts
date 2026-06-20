import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';

@Module({ imports: [JwtModule.register({})], controllers: [ChatController], providers: [ChatGateway, ChatService], exports: [ChatGateway] })
export class ChatModule {}
