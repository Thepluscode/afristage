import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { HealthController } from './health.controller';
import { RedisService } from './common/redis.service';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CreatorsModule } from './modules/creators/creators.module';
import { LiveRoomsModule } from './modules/live-rooms/live-rooms.module';
import { ChatModule } from './modules/chat/chat.module';
import { GiftsModule } from './modules/gifts/gifts.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PayoutsModule } from './modules/payouts/payouts.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { AdminModule } from './modules/admin/admin.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { BetaModule } from './modules/beta/beta.module';
import { SupportModule } from './modules/support/support.module';
import { FraudModule } from './modules/fraud/fraud.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // ponytail: in-memory throttling. Move to Redis storage (ThrottlerStorageRedisService)
    // when running more than one API instance, or limits are per-instance.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    CreatorsModule,
    LiveRoomsModule,
    ChatModule,
    GiftsModule,
    WalletModule,
    PaymentsModule,
    PayoutsModule,
    ModerationModule,
    AdminModule,
    NotificationsModule,
    AnalyticsModule,
    BetaModule,
    SupportModule,
    FraudModule
  ],
  controllers: [HealthController],
  providers: [
    RedisService,
    // THROTTLE_DISABLED=true turns off rate limiting for test/CI runs only. Never set in prod.
    ...(process.env.THROTTLE_DISABLED === 'true' ? [] : [{ provide: APP_GUARD, useClass: ThrottlerGuard }])
  ]
})
export class AppModule {}
