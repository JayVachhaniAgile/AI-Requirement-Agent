import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RkbService } from './rkb.service';
import {
  KnowledgeItem,
  ClarificationQuestion,
  ValidationIssue,
  Document,
  DocumentVersion,
  AgentExecution,
} from '../database/entities';

@Module({
  imports: [TypeOrmModule.forFeature([
    KnowledgeItem, ClarificationQuestion, ValidationIssue, Document, DocumentVersion, AgentExecution,
  ])],
  providers: [RkbService],
  exports: [RkbService],
})
export class RkbModule {}
