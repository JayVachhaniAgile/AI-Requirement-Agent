import { Module } from '@nestjs/common';
import { ProjectVersionModule } from './projects/project-version.module';
import { ProjectKnowledgeModule } from './knowledge/project-knowledge.module';
import { ContextEngineModule } from './context/context-engine.module';
import { ArtifactsModule } from './artifacts/artifacts.module';
import { WorkflowExecutionModule } from './orchestration/workflow-execution.module';
import { QualityGateModule } from './validation/quality-gate.module';
import { ModelRouterModule } from './models/model-router.module';
import { ObservabilityModule } from './observability/observability.module';
import { CanonicalModelModule } from './canonical/canonical-model.module';
import { SkillModule } from './skills/skill.module';
import { MigrationModule } from './migration/migration.module';
import { OrchestrationModule } from './orchestration/orchestration.module';
import { DocumentsModule } from './documents/documents.module';
import { FoundationController } from './foundation.controller';
import { ProjectKnowledgeController } from './knowledge/project-knowledge.controller';

@Module({
  imports: [
    ProjectVersionModule,
    ProjectKnowledgeModule,
    ContextEngineModule,
    ArtifactsModule,
    SkillModule,
    MigrationModule,
    OrchestrationModule,
    DocumentsModule,
    WorkflowExecutionModule,
    QualityGateModule,
    ModelRouterModule,
    ObservabilityModule,
    CanonicalModelModule,
  ],
  controllers: [
    FoundationController,
    ProjectKnowledgeController,
  ],
})
export class FoundationModule {}
