import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Document } from '../database/entities';
import { DagEngineService } from '../dag-engine/dag-engine.service';
import { ArtifactsService } from './artifacts.service';

@Controller('artifacts')
export class ArtifactsController {
  constructor(
    private readonly artifacts: ArtifactsService,
    private readonly dagEngine: DagEngineService,
    @InjectRepository(Document) private readonly docRepo: Repository<Document>,
  ) {}

  @Get()
  listArtifacts() {
    return this.artifacts.listArtifacts();
  }

  @Get(':id/html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store, max-age=0')
  @Header('Content-Security-Policy', "default-src 'self' 'unsafe-inline'; img-src 'self' data:;")
  artifactHtml(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('mode') mode?: string,
  ) {
    const renderMode = mode === 'website' ? 'website' : 'document';
    return this.artifacts.renderArtifactHtml(id, renderMode);
  }

  /**
   * Generate (or regenerate) the build-prompt artifact for a project.
   * Works for projects that completed before the artifact feature existed —
   * the prompt is derived from the project's existing knowledge items.
   */
  @Post('generate')
  @HttpCode(202)
  async generate(@Body() body: { projectId?: string }) {
    if (!body?.projectId || typeof body.projectId !== 'string') {
      throw new BadRequestException('projectId is required');
    }
    await this.dagEngine.regenerateBuildPrompt(body.projectId);
    return { status: 'GENERATED', projectId: body.projectId };
  }

  /**
   * Regenerate the artifact for its project (rebuilds the BUILD_PROMPT
   * document in place without touching downstream pipeline stages).
   */
  @Post(':id/regenerate')
  @HttpCode(202)
  async regenerate(@Param('id', ParseUUIDPipe) id: string) {
    const doc = await this.docRepo.findOne({ where: { id } });
    if (!doc) throw new BadRequestException(`Artifact ${id} not found`);
    await this.dagEngine.regenerateBuildPrompt(doc.projectId);
    return { id, status: 'REGENERATING', projectId: doc.projectId };
  }
}
