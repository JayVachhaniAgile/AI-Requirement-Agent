import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { DatabaseModule } from './database/database.module';
import { LlmModule } from './llm/llm.module';
import { AgentsModule } from './agents/agents.module';
import { RkbModule } from './rkb/rkb.module';
import { WorkflowModule } from './workflow/workflow.module';
import { ProjectsModule } from './projects/projects.module';
import { HealthModule } from './health/health.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AggregateModule } from './aggregate/aggregate.module';
import { SettingsModule } from './settings/settings.module';
import { InterviewModule } from './interview/interview.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(__dirname, '..', '.env'),
        join(process.cwd(), '.env'),
      ],
    }),
    DatabaseModule,
    LlmModule,
    AgentsModule,
    RkbModule,
    RealtimeModule,
    WorkflowModule,
    ProjectsModule,
    HealthModule,
    AggregateModule,
    SettingsModule,
    InterviewModule,
  ],
})
export class AppModule {}
