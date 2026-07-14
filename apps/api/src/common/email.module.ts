import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';

// Global for the same reason as RedisModule: any feature (auth recovery,
// beta invites, future notifications) injects the ONE transport.
@Global()
@Module({ providers: [EmailService], exports: [EmailService] })
export class EmailModule {}
