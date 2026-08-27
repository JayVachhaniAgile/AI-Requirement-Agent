import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Project,
  WorkflowStep,
  AgentExecution,
  KnowledgeItem,
  ClarificationQuestion,
  ValidationIssue,
  Document,
} from '../database/entities';
import { ProjectsGateway } from './projects.gateway';
import { WorkflowEventsService } from './workflow-events.service';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Project,
      WorkflowStep,
      AgentExecution,
      KnowledgeItem,
      ClarificationQuestion,
      ValidationIssue,
      Document,
    ]),
  ],
  providers: [ProjectsGateway, WorkflowEventsService, DashboardService],
  exports: [ProjectsGateway, WorkflowEventsService, DashboardService],
})
export class RealtimeModule {}
