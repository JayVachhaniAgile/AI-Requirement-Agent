import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { RkbModule } from '../rkb/rkb.module';
import { ValidationModule } from '../validation/validation.module';
import { RunLogModule } from '../run-log/run-log.module';
import { SkillModule } from '../foundation/skills/skill.module';
import { MigrationModule } from '../foundation/migration/migration.module';
import { ObservabilityModule } from '../foundation/observability/observability.module';
import { AgentRunnerService } from './agent-runner.service';
import { DocumentRunnerService } from './document-runner.service';
import { DiscoveryService } from './discovery.service';
import { ResearchService } from './research.service';
import { BusinessAnalystService } from './business-analyst.service';
import { ProductManagerService } from './product-manager.service';
import { RequirementsEngineerService } from './requirements-engineer.service';
import { UxService } from './ux.service';
import { DataArchitectService } from './data-architect.service';
import { AiArchitectService } from './ai-architect.service';
import { SolutionArchitectService } from './solution-architect.service';
import { SecurityService } from './security.service';
import { QaService } from './qa.service';
import { EstimationService } from './estimation.service';
import { CriticService } from './critic.service';
import { CompilerService } from './compiler.service';
import { DebateService } from './debate.service';
import { DomainService } from './domain.service';
import { FrdService } from './frd.service';
import { UserStoriesService } from './user-stories.service';
import { TechArchService } from './tech-arch.service';
import { DbDesignService } from './db-design.service';
import { ApiSpecService } from './api-spec.service';
import { SowService } from './sow.service';

@Module({
  imports: [
    LlmModule,
    RkbModule,
    ValidationModule,
    RunLogModule,
    SkillModule,
    MigrationModule,
    ObservabilityModule,
  ],
  providers: [
    AgentRunnerService,
    DocumentRunnerService,
    DiscoveryService,
    ResearchService,
    BusinessAnalystService,
    ProductManagerService,
    RequirementsEngineerService,
    UxService,
    DataArchitectService,
    AiArchitectService,
    SolutionArchitectService,
    SecurityService,
    QaService,
    EstimationService,
    CriticService,
    CompilerService,
    DebateService,
    DomainService,
    FrdService,
    UserStoriesService,
    TechArchService,
    DbDesignService,
    ApiSpecService,
    SowService,
  ],
  exports: [
    AgentRunnerService,
    DocumentRunnerService,
    DiscoveryService,
    ResearchService,
    BusinessAnalystService,
    ProductManagerService,
    RequirementsEngineerService,
    UxService,
    DataArchitectService,
    AiArchitectService,
    SolutionArchitectService,
    SecurityService,
    QaService,
    EstimationService,
    CriticService,
    CompilerService,
    DebateService,
    DomainService,
    FrdService,
    UserStoriesService,
    TechArchService,
    DbDesignService,
    ApiSpecService,
    SowService,
  ],
})
export class AgentsModule {}
