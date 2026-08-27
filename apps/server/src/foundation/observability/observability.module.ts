import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModelUsage } from '../../database/entities';
import { ModelUsageService } from './model-usage.service';
import { ObservabilityController } from './observability.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ModelUsage])],
  controllers: [ObservabilityController],
  providers: [ModelUsageService],
  exports: [ModelUsageService],
})
export class ObservabilityModule {}
