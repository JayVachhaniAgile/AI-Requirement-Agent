import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { DatabaseModule } from './database/database.module';
import { LlmModule } from './llm/llm.module';
import { AgentsModule } from './agents/agents.module';
import { RkbModule } from './rkb/rkb.module';
import { ProjectsModule } from './projects/projects.module';
import { HealthModule } from './health/health.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AggregateModule } from './aggregate/aggregate.module';
import { SettingsModule } from './settings/settings.module';
import { InterviewModule } from './interview/interview.module';
import { ValidationModule } from './validation/validation.module';
import { DiscoveryCheckpointModule } from './checkpoint/discovery-checkpoint.module';
import { RunLogModule } from './run-log/run-log.module';
import { GapAnalysisModule } from './gap-analysis/gap-analysis.module';
import { ProjectContextModule } from './project-context/project-context.module';
import { PromptsModule } from './prompts/prompts.module';
import { DagEngineModule } from './dag-engine/dag-engine.module';
import { KnowledgeGraphModule } from './knowledge-graph/knowledge-graph.module';
import { RelationshipsModule } from './relationships/relationships.module';
import { ArtifactsModule } from './artifacts/artifacts.module';
import { FoundationModule } from './foundation/foundation.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(__dirname, '..', '.env'), join(process.cwd(), '.env')],
    }),
    AuthModule,
    DatabaseModule,
    LlmModule,
    AgentsModule,
    RkbModule,
    RealtimeModule,
    ProjectsModule,
    HealthModule,
    AggregateModule,
    SettingsModule,
    InterviewModule,
    ValidationModule,
    DiscoveryCheckpointModule,
    RunLogModule,
    GapAnalysisModule,
    ProjectContextModule,
    PromptsModule,
    DagEngineModule,
    KnowledgeGraphModule,
    RelationshipsModule,
    ArtifactsModule,
    FoundationModule,
  ],
})
export class AppModule {}
