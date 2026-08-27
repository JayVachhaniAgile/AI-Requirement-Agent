import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ProjectVersionService } from './project-version.service';

@Controller('foundation/projects')
export class ProjectVersionController {
  constructor(private readonly versions: ProjectVersionService) {}

  @Get(':projectId/versions')
  list(@Param('projectId') projectId: string) {
    return this.versions.listVersions(projectId);
  }

  @Get(':projectId/versions/:version')
  get(
    @Param('projectId') projectId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.versions.getVersion(projectId, version);
  }

  @Post(':projectId/versions')
  create(
    @Param('projectId') projectId: string,
    @Body() body: { reason?: string; createdBy?: string; metadata?: Record<string, unknown> },
  ) {
    return this.versions.createVersion(projectId, body);
  }
}
