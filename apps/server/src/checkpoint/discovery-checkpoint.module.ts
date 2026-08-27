import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiscoveryCheckpointService } from './discovery-checkpoint.service';
import { DiscoveryCheckpoint, ClarificationQuestion } from '../database/entities';

@Module({
  imports: [TypeOrmModule.forFeature([DiscoveryCheckpoint, ClarificationQuestion])],
  providers: [DiscoveryCheckpointService],
  exports: [DiscoveryCheckpointService],
})
export class DiscoveryCheckpointModule {}
