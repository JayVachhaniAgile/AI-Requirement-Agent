import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { WorkflowExecutionService } from './workflow-execution.service';

@Controller('foundation/orchestration')
export class WorkflowExecutionController {
  constructor(private readonly workflow: WorkflowExecutionService) {}

  @Post('workflows')
  start(
    @Body()
    body: {
      projectId: string;
      projectVersionId?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.workflow.startWorkflow(body);
  }

  @Post('workflows/:id/complete')
  complete(
    @Param('id') id: string,
    @Body() body: { status: 'COMPLETED' | 'FAILED' | 'CANCELLED'; error?: string },
  ) {
    return this.workflow.completeWorkflow(id, body.status, body.error);
  }

  @Get('workflows/:projectId')
  list(@Param('projectId') projectId: string) {
    return this.workflow.listWorkflows(projectId);
  }

  @Post('skill-executions')
  startSkill(
    @Body()
    body: {
      projectId: string;
      skillKey: string;
      skillId?: string;
      workflowExecutionId?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.workflow.startSkillExecution(body);
  }

  @Post('skill-executions/:id/complete')
  completeSkill(
    @Param('id') id: string,
    @Body()
    body: {
      status?: 'COMPLETED' | 'FAILED' | 'SKIPPED';
      inputTokens?: number;
      outputTokens?: number;
      model?: string;
      retryCount?: number;
      confidence?: number;
      error?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.workflow.completeSkillExecution(id, body);
  }

  @Get('skill-executions/:workflowExecutionId')
  listSkills(@Param('workflowExecutionId') workflowExecutionId: string) {
    return this.workflow.listSkillExecutions(workflowExecutionId);
  }
}
