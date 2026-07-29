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
} from '../database/entities';
import { WorkflowModule } from '../workflow/workflow.module';
import { RealtimeModule } from '../realtime/realtime.module';

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
    ]),
    WorkflowModule,
    RealtimeModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
