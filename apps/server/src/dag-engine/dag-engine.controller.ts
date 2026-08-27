import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { DagEngineService } from './dag-engine.service';
import { CRYSTALLIZE_PIPELINE_DAG } from './pipeline.dag';

@Controller()
export class DagEngineController {
  constructor(private readonly engine: DagEngineService) {}

  // -- definitions & planning (global) --------------------------------------

  @Get('dag/definitions')
  listDefinitions() {
    return this.engine.listDefinitions();
  }

  @Get('dag/definitions/:key')
  getDefinition(@Param('key') key: string) {
    const def = this.engine.getDefinition(key);
    return { definition: def, plan: this.engine.getPlan(key) };
  }

  @Get('dag/definitions/:key/plan')
  plan(@Param('key') key: string) {
    return this.engine.getPlan(key);
  }

  @Get('dag/definitions/:key/inspect')
  inspect(@Param('key') key: string) {
    return this.engine.inspect(key);
  }

  // -- runs (project-scoped) ------------------------------------------------

  @Post('projects/:projectId/dag/run')
  startRun(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() body: { definitionKey?: string },
  ) {
    return this.engine.startRun(projectId, body.definitionKey ?? CRYSTALLIZE_PIPELINE_DAG.key);
  }

  // -- project-level convenience (mirrors projects controller) ------------

  @Post('projects/:projectId/dag/start')
  startProject(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.engine.startProject(projectId);
  }

  @Post('projects/:projectId/dag/resume')
  resumeProject(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.engine.resumeProject(projectId);
  }

  @Post('projects/:projectId/dag/pause')
  pauseProject(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.engine.pauseProject(projectId);
  }

  @Post('projects/:projectId/dag/recompile')
  recompileDocument(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.engine.recompileDocument(projectId);
  }

  @Post('projects/:projectId/dag/regenerate/:nodeKey')
  regenerateNode(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('nodeKey') nodeKey: string,
  ) {
    return this.engine.regenerateNode(projectId, nodeKey);
  }

  @Post('projects/:projectId/dag/regenerate-build-prompt')
  regenerateBuildPrompt(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.engine.regenerateBuildPrompt(projectId);
  }

  @Post('projects/:projectId/dag/cancel')
  cancelProject(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.engine.cancelProject(projectId);
  }

  @Get('projects/:projectId/dag/state')
  latestState(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.engine.getLatestRunState(projectId);
  }

  @Get('dag/runs/:runId')
  runState(@Param('runId', ParseUUIDPipe) runId: string) {
    return this.engine.getRunState(runId);
  }

  @Post('dag/runs/:runId/pause')
  pause(@Param('runId', ParseUUIDPipe) runId: string) {
    return this.engine.pause(runId);
  }

  @Post('dag/runs/:runId/resume')
  resume(@Param('runId', ParseUUIDPipe) runId: string) {
    return this.engine.resume(runId);
  }

  @Post('dag/runs/:runId/nodes/:nodeKey/retry')
  retryNode(
    @Param('runId', ParseUUIDPipe) runId: string,
    @Param('nodeKey') nodeKey: string,
  ) {
    return this.engine.retryNode(runId, nodeKey);
  }

  @Post('dag/runs/:runId/nodes/:nodeKey/skip')
  skipNode(
    @Param('runId', ParseUUIDPipe) runId: string,
    @Param('nodeKey') nodeKey: string,
  ) {
    return this.engine.skipNode(runId, nodeKey);
  }

  @Post('dag/runs/:runId/nodes/:nodeKey/approve')
  approveCheckpoint(
    @Param('runId', ParseUUIDPipe) runId: string,
    @Param('nodeKey') nodeKey: string,
  ) {
    return this.engine.approveCheckpoint(runId, nodeKey);
  }
}
