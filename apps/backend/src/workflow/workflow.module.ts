import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowService } from './workflow.service';
import { Project, WorkflowStep } from '../database/entities';
import { RkbModule } from '../rkb/rkb.module';
import { AgentsModule } from '../agents/agents.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, WorkflowStep]),
    RkbModule,
    AgentsModule,
    RealtimeModule,
  ],
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
