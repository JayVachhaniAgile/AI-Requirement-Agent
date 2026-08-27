import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProjectKnowledgeService } from './project-knowledge.service';

@Controller('foundation/projects/:projectId/knowledge')
export class ProjectKnowledgeController {
  constructor(private readonly knowledge: ProjectKnowledgeService) {}

  @Get()
  list(@Param('projectId') projectId: string, @Query('type') type?: string) {
    return this.knowledge.list(projectId, type);
  }

  @Get('digest')
  digest(@Param('projectId') projectId: string, @Query('type') type?: string) {
    return this.knowledge.digest(projectId, type);
  }

  @Get('count')
  async count(@Param('projectId') projectId: string) {
    return { projectId, count: await this.knowledge.count(projectId) };
  }
}
