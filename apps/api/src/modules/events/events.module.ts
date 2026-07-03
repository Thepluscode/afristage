import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({ imports: [JwtModule.register({})], controllers: [EventsController], providers: [EventsService] })
export class EventsModule {}
