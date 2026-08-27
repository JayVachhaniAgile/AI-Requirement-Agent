import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentSkill, AgentSkillExecution, WorkflowExecution, ModelUsage, CanonicalItem, CanonicalItemVersion, Project, KnowledgeItem } from '../../database/entities';
import { LlmModule } from '../../llm/llm.module';
import { ModelRouterModule } from '../models/model-router.module';
import { ObservabilityModule } from '../observability/observability.module';
import { WorkflowExecutionModule } from '../orchestration/workflow-execution.module';
import { ContextEngineModule } from '../context/context-engine.module';
import { CanonicalModelModule } from '../canonical/canonical-model.module';
import { QualityGateModule } from '../validation/quality-gate.module';
import { ArtifactsModule } from '../artifacts/artifacts.module';
import { SkillRegistryService } from './skill-registry.service';
import { SkillExecutorService } from './skill-executor.service';
import { SkillsController } from './skill.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AgentSkill,
      AgentSkillExecution,
      WorkflowExecution,
      ModelUsage,
      CanonicalItem,
      CanonicalItemVersion,
      Project,
      KnowledgeItem,
    ]),
    LlmModule,
    ModelRouterModule,
    ObservabilityModule,
    WorkflowExecutionModule,
    ContextEngineModule,
    CanonicalModelModule,
    QualityGateModule,
    ArtifactsModule,
  ],
  controllers: [SkillsController],
  providers: [SkillRegistryService, SkillExecutorService],
  exports: [SkillRegistryService, SkillExecutorService],
})
export class SkillModule {}
