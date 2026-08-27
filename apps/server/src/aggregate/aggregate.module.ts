import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AggregateController } from './aggregate.controller';
import {
  Project,
  KnowledgeItem,
  WorkflowStep,
  AgentExecution,
  ClarificationQuestion,
  ValidationIssue,
  Document,
} from '../database/entities';
import { RunLogModule } from '../run-log/run-log.module';

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
    RunLogModule,
  ],
  controllers: [AggregateController],
})
export class AggregateModule {}
