import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Project,
  WorkflowDagDefinition,
  WorkflowDagNodeRun,
  WorkflowDagRun,
  WorkflowStep,
} from '../database/entities';
import { AgentsModule } from '../agents/agents.module';
import { RkbModule } from '../rkb/rkb.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { GapAnalysisModule } from '../gap-analysis/gap-analysis.module';
import { KnowledgeGraphModule } from '../knowledge-graph/knowledge-graph.module';
import { DiscoveryCheckpointModule } from '../checkpoint/discovery-checkpoint.module';
import { IntegrationModule } from '../foundation/integration/integration.module';
import { ContextEngineModule } from '../foundation/context/context-engine.module';
import { RunLogModule } from '../run-log/run-log.module';
import { DagEngineController } from './dag-engine.controller';
import { DagEngineService } from './dag-engine.service';
import { NodeExecutorRegistry } from './node-executor.registry';
import { DagEventsService } from './dag-events.service';
import { DagRealtimeBridge } from './dag-realtime-bridge.service';
import { DagAgentExecutorAdapter } from './dag-agent-executor.adapter';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, WorkflowDagDefinition, WorkflowDagRun, WorkflowDagNodeRun, WorkflowStep]),
    AgentsModule,
    RkbModule,
    RealtimeModule,
    GapAnalysisModule,
    KnowledgeGraphModule,
    DiscoveryCheckpointModule,
    RunLogModule,
    IntegrationModule,
    ContextEngineModule,
  ],
  controllers: [DagEngineController],
  providers: [
    DagEngineService,
    NodeExecutorRegistry,
    DagEventsService,
    DagRealtimeBridge,
    DagAgentExecutorAdapter,
  ],
  exports: [DagEngineService, NodeExecutorRegistry, DagEventsService],
})
export class DagEngineModule {
  constructor(
    registry: NodeExecutorRegistry,
    adapter: DagAgentExecutorAdapter,
  ) {
    adapter.registerAll(registry);
  }
}
