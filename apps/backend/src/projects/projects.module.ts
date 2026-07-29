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
import { WorkflowModule } from '../workflow/workflow.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AgentsModule } from '../agents/agents.module';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Project, KnowledgeItem, WorkflowStep, AgentExecution,
      ClarificationQuestion, ValidationIssue, Document, DocumentVersion,
    ]),
    WorkflowModule,
    RealtimeModule,
    AgentsModule,
    LlmModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
