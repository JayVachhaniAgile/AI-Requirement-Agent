import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ModelUsageService } from './model-usage.service';

@Controller('foundation/observability')
export class ObservabilityController {
  constructor(private readonly usage: ModelUsageService) {}

  @Post('usage')
  record(
    @Body()
    body: {
      projectId: string;
      workflowExecutionId?: string;
      skillExecutionId?: string;
      skillKey?: string;
      model: string;
      provider?: string;
      mode?: string;
      inputTokens: number;
      outputTokens: number;
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.usage.record(body);
  }

  @Get('usage/:projectId/summary')
  summary(@Param('projectId') projectId: string) {
    return this.usage.summarize(projectId);
  }
}
