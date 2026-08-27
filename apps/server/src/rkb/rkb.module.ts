import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RkbService } from './rkb.service';
import { ObservabilityModule } from '../foundation/observability/observability.module';
import { ArtifactsModule as FoundationArtifactsModule } from '../foundation/artifacts/artifacts.module';
import {
  KnowledgeItem,
  ClarificationQuestion,
  ValidationIssue,
  Document,
  DocumentVersion,
  AgentExecution,
} from '../database/entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      KnowledgeItem, ClarificationQuestion, ValidationIssue, Document, DocumentVersion, AgentExecution,
    ]),
    ObservabilityModule,
    FoundationArtifactsModule,
  ],
  providers: [RkbService],
  exports: [RkbService],
})
export class RkbModule {}
