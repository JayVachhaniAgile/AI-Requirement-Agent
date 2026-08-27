import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { QualityGateService } from './quality-gate.service';
import { QualityEngineService } from './quality-engine.service';
import type { EvaluatedArtifact } from './quality.types';

@Controller('foundation/quality')
export class QualityGateController {
  constructor(
    private readonly gates: QualityGateService,
    private readonly engine: QualityEngineService,
  ) {}

  @Get('gates')
  listGates() {
    return this.gates.listGates();
  }

  @Post('run/:projectId')
  run(
    @Param('projectId') projectId: string,
    @Body()
    body: {
      workflowExecutionId?: string;
      minKnowledgeItems?: number;
      requiredKnowledgeTypes?: string[];
      requiredArtifactTypes?: string[];
    },
  ) {
    return this.gates.run({ projectId, ...body });
  }

  @Get('project/:projectId')
  history(@Param('projectId') projectId: string) {
    return this.gates.listForProject(projectId);
  }

  // -------- Quality Engine (Phase 8) --------

  @Get('engine/checks')
  engineChecks() {
    return this.engine.thresholds();
  }

  @Get('engine/thresholds')
  engineThresholds() {
    return this.engine.thresholds();
  }

  @Post('engine/projects/:projectId/evaluate')
  evaluateProject(@Param('projectId') projectId: string) {
    return this.engine.evaluateProject(projectId);
  }

  @Post('engine/artifacts')
  evaluateArtifact(
    @Body()
    body: {
      projectId: string;
      artifact: EvaluatedArtifact;
      allArtifacts?: EvaluatedArtifact[];
      workflowExecutionId?: string;
    },
  ) {
    return this.engine.evaluateArtifactAndPersist(body);
  }

  @Get('engine/projects/:projectId/checks')
  engineChecksHistory(@Param('projectId') projectId: string) {
    return this.engine.listChecks(projectId);
  }
}
