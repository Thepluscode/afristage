import { Global, Module } from '@nestjs/common';
import { AggregationService } from './aggregation.service';

// Global: every counting feature (charts, events, supporters, circles, gifts,
// creators) reads through this one engine — R5 §9 #5.
@Global()
@Module({ providers: [AggregationService], exports: [AggregationService] })
export class AggregationModule {}
