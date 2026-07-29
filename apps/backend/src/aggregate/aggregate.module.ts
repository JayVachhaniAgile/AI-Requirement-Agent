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
  ],
  controllers: [AggregateController],
})
export class AggregateModule {}
