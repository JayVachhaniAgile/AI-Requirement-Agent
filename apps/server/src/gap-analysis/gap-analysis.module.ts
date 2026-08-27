import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GapAnalysisService } from './gap-analysis.service';
import {
  GapAnalysisRun,
  GapAnalysisActiveRun,
  GapAnalysisProposal,
  Project,
} from '../database/entities';
import { RkbModule } from '../rkb/rkb.module';
import { AgentsModule } from '../agents/agents.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GapAnalysisRun, GapAnalysisActiveRun, GapAnalysisProposal, Project]),
    RkbModule,
    AgentsModule,
    RealtimeModule,
  ],
  providers: [GapAnalysisService],
  exports: [GapAnalysisService],
})
export class GapAnalysisModule {}
