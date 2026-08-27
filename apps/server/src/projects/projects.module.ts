import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import {
  Project,
  KnowledgeItem,
  WorkflowStep,
  AgentExecution,
  ClarificationQuestion,
  ValidationIssue,
  Document,
  DocumentVersion,
} from '../database/entities';
import { DagEngineModule } from '../dag-engine/dag-engine.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AgentsModule } from '../agents/agents.module';
import { LlmModule } from '../llm/llm.module';
import { DiscoveryCheckpointModule } from '../checkpoint/discovery-checkpoint.module';
import { RunLogModule } from '../run-log/run-log.module';
import { GapAnalysisModule } from '../gap-analysis/gap-analysis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Project,
      KnowledgeItem,
      WorkflowStep,
      AgentExecution,
      ClarificationQuestion,
      ValidationIssue,
      Document,
      DocumentVersion,
    ]),
    DagEngineModule,
    RealtimeModule,
    AgentsModule,
    LlmModule,
    DiscoveryCheckpointModule,
    RunLogModule,
    GapAnalysisModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
