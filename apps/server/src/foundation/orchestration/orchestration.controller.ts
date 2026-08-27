import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { OrchestrationService } from './orchestration.service';
import type { OrchestrationRequest } from './orchestration.types';

@Controller('foundation/orchestration')
export class OrchestrationController {
  constructor(private readonly orchestration: OrchestrationService) {}

  @Post('plans')
  create(@Body() request: OrchestrationRequest) {
    return this.orchestration.createPlan(request);
  }

  @Post('plans/:id/run')
  run(@Param('id') id: string) {
    return this.orchestration.runPlan(id);
  }

  @Post('plans/:id/pause')
  async pause(@Param('id') id: string) {
    await this.orchestration.pausePlan(id);
    return { paused: id };
  }

  @Post('plans/:id/resume')
  resume(@Param('id') id: string) {
    return this.orchestration.resumePlan(id);
  }

  @Post('plans/:id/nodes/:nodeId/retry')
  retry(@Param('id') id: string, @Param('nodeId') nodeId: string) {
    return this.orchestration.retryNode(id, nodeId);
  }

  @Post('plans/:id/checkpoints/:nodeId/approve')
  approve(@Param('id') id: string, @Param('nodeId') nodeId: string, @Body() body: { approvedBy?: string }) {
    return this.orchestration.decideCheckpoint(id, nodeId, 'APPROVED', body.approvedBy);
  }

  @Post('plans/:id/checkpoints/:nodeId/reject')
  reject(@Param('id') id: string, @Param('nodeId') nodeId: string) {
    return this.orchestration.decideCheckpoint(id, nodeId, 'REJECTED');
  }

  @Get('plans/:id')
  get(@Param('id') id: string) {
    return this.orchestration.getPlan(id);
  }

  @Get('projects/:projectId/plans')
  list(@Param('projectId') projectId: string) {
    return this.orchestration.listPlans(projectId);
  }
}
