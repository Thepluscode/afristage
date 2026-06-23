import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({ imports: [JwtModule.register({}), NotificationsModule], controllers: [UsersController], providers: [UsersService] })
export class UsersModule {}
