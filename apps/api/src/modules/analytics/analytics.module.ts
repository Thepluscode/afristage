import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({ imports: [JwtModule.register({})], controllers: [AnalyticsController], providers: [AnalyticsService] })
export class AnalyticsModule {}
