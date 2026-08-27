import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ArtifactDependencyService } from './artifact-dependency.service';
import { ImpactAnalysisService } from './impact-analysis.service';
import type { DependencyType } from './artifact-dependency.types';
import { DEPENDENCY_TYPES } from './artifact-dependency.types';

@Controller('foundation')
export class ArtifactDependencyController {
  constructor(
    private readonly deps: ArtifactDependencyService,
    private readonly impactService: ImpactAnalysisService,
  ) {}

  @Post('projects/:projectId/dependencies')
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body()
    body: {
      sourceArtifactId: string;
      targetArtifactId: string;
      dependencyType: DependencyType;
      weight?: number;
      confidence?: number;
      sourceReference?: string;
      createdBy?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.deps.create({ ...body, projectId });
  }

  @Get('artifacts/:artifactId/dependencies')
  dependencies(
    @Param('artifactId') artifactId: string,
    @Query('dependencyType') dependencyType?: DependencyType,
    @Query('strictOnly') strictOnly?: string,
  ) {
    return this.deps.getDirectDependencies(artifactId, {
      dependencyTypes: dependencyType ? [dependencyType] : undefined,
      strictOnly: strictOnly === 'true',
    });
  }

  @Get('artifacts/:artifactId/dependents')
  dependents(
    @Param('artifactId') artifactId: string,
    @Query('dependencyType') dependencyType?: DependencyType,
  ) {
    return this.deps.getDependents(artifactId, {
      dependencyTypes: dependencyType ? [dependencyType] : undefined,
    });
  }

  @Get('artifacts/:artifactId/downstream')
  downstream(
    @Param('artifactId') artifactId: string,
    @Query('maxDepth') maxDepth?: string,
  ) {
    return this.deps.getDownstream(artifactId, {
      maxDepth: maxDepth ? Math.max(1, Math.min(20, Number(maxDepth))) : undefined,
    });
  }

  @Get('artifacts/:artifactId/upstream')
  upstream(
    @Param('artifactId') artifactId: string,
    @Query('maxDepth') maxDepth?: string,
  ) {
    return this.deps.getUpstream(artifactId, {
      maxDepth: maxDepth ? Math.max(1, Math.min(20, Number(maxDepth))) : undefined,
    });
  }

  @Get('artifacts/:artifactId/paths')
  paths(
    @Param('artifactId') artifactId: string,
    @Query('maxDepth') maxDepth?: string,
  ) {
    return this.deps.getPaths(artifactId, {
      maxDepth: maxDepth ? Math.max(1, Math.min(10, Number(maxDepth))) : 10,
    });
  }

  @Get('artifacts/:artifactId/impact')
  impactReport(
    @Param('artifactId') artifactId: string,
    @Query('maxDepth') maxDepth?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.impactService.analyze(projectId ?? '', artifactId, {
      maxDepth: maxDepth ? Math.max(1, Math.min(20, Number(maxDepth))) : 8,
    });
  }

  @Get('projects/:projectId/graph')
  graph(@Param('projectId') projectId: string) {
    return this.deps.getGraph(projectId);
  }

  @Get('projects/:projectId/graph/validation')
  validation(@Param('projectId') projectId: string) {
    return this.deps.validateProjectGraph(projectId);
  }

  @Patch('dependencies/:id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      dependencyType?: DependencyType;
      weight?: number;
      confidence?: number | null;
      sourceReference?: string | null;
      metadata?: Record<string, unknown> | null;
    },
  ) {
    return this.deps.update(id, body);
  }

  @Delete('dependencies/:id')
  async delete(@Param('id') id: string) {
    await this.deps.delete(id);
    return { deleted: id };
  }

  @Get('dependencies/types')
  types() {
    return { types: DEPENDENCY_TYPES };
  }
}
