import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CirclesController } from './circles.controller';
import { CirclesService } from './circles.service';
import { FraudModule } from '../fraud/fraud.module';

@Module({ imports: [JwtModule.register({}), FraudModule], controllers: [CirclesController], providers: [CirclesService] })
export class CirclesModule {}
