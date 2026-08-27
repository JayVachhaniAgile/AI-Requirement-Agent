import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ArtifactRegistryService } from './artifact-registry.service';

@Controller('foundation')
export class ArtifactsController {
  constructor(private readonly artifacts: ArtifactRegistryService) {}

  @Get('projects/:projectId/artifacts')
  list(
    @Param('projectId') projectId: string,
    @Query('type') type?: string,
  ) {
    return this.artifacts.listByProject(projectId, type);
  }

  @Post('projects/:projectId/artifacts')
  create(
    @Param('projectId') projectId: string,
    @Body()
    body: {
      type: string;
      key?: string;
      title?: string;
      summary?: string;
      content?: string;
      status?: string;
      source?: string;
      sourceVersion?: string;
      createdBy?: string;
      confidence?: number;
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.artifacts.upsertArtifact({ projectId, ...body });
  }

  @Get('projects/:projectId/artifacts/plan')
  plan(@Param('projectId') projectId: string) {
    return this.artifacts.planLayers(projectId);
  }

  @Get('projects/:projectId/artifacts/:artifactId')
  get(
    @Param('projectId') projectId: string,
    @Param('artifactId') artifactId: string,
  ) {
    return this.artifacts.getById(projectId, artifactId);
  }

  @Post('artifacts/:artifactId/versions')
  publishVersion(
    @Param('artifactId') artifactId: string,
    @Body()
    body: {
      content?: string;
      summary?: string;
      status?: string;
      confidence?: number;
      metadata?: Record<string, unknown>;
      createdBy?: string;
    },
  ) {
    return this.artifacts.publishNewVersion(artifactId, body);
  }

  @Get('artifacts/:artifactId/versions')
  versions(@Param('artifactId') artifactId: string) {
    return this.artifacts.listVersions(artifactId);
  }

  @Post('projects/:projectId/dependencies')
  addDependency(
    @Param('projectId') projectId: string,
    @Body()
    body: {
      sourceArtifactId: string;
      targetArtifactId: string;
      relation: string;
      weight?: number;
      producer?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.artifacts.addDependency(body);
  }

  @Get('projects/:projectId/dependencies')
  dependencies(@Param('projectId') projectId: string) {
    return this.artifacts.listDependencies(projectId);
  }

  @Get('projects/:projectId/artifacts/:artifactId/impact')
  impact(
    @Param('projectId') projectId: string,
    @Param('artifactId') artifactId: string,
    @Query('maxDepth') maxDepth?: string,
  ) {
    const depth = maxDepth ? Math.max(1, Math.min(10, Number(maxDepth))) : 5;
    return this.artifacts.impactReport(projectId, artifactId, depth);
  }
}
