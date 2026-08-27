import { Body, Controller, Param, Post, Query } from '@nestjs/common';
import { ContextEngineService } from './context-engine.service';
import type { ContextRequest } from './context.types';

@Controller('foundation/context')
export class ContextEngineController {
  constructor(private readonly engine: ContextEngineService) {}

  @Post('projects/:projectId/compile')
  compile(
    @Param('projectId') projectId: string,
    @Body() body: Omit<ContextRequest, 'projectId'>,
    @Query('refresh') refresh?: string,
  ) {
    const request: ContextRequest = { ...body, projectId };
    return this.engine.compile(request, refresh === 'true');
  }

  @Post('projects/:projectId/invalidate')
  invalidate(
    @Param('projectId') projectId: string,
    @Body() body: { kind?: string; externalId?: string },
  ) {
    const count = this.engine.invalidateForSource(
      (ref) =>
        ref.projectId === projectId &&
        (body.kind === undefined || ref.kind === body.kind) &&
        (body.externalId === undefined || ref.externalId === body.externalId),
    );
    return { invalidated: count };
  }
}
