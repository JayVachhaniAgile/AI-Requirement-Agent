import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
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

const AGENTS = [
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
];

@Module({
  imports: [LlmModule],
  providers: AGENTS,
  exports: AGENTS,
})
export class AgentsModule {}
