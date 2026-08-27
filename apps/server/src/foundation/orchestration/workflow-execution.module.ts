import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AgentSkillExecution,
  WorkflowExecution,
} from '../../database/entities';
import { WorkflowExecutionService } from './workflow-execution.service';
import { WorkflowExecutionController } from './workflow-execution.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkflowExecution, AgentSkillExecution]),
  ],
  controllers: [WorkflowExecutionController],
  providers: [WorkflowExecutionService],
  exports: [WorkflowExecutionService],
})
export class WorkflowExecutionModule {}
