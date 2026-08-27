import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CanonicalModelService } from './canonical-model.service';
import { CANONICAL_KINDS, type CanonicalKind } from './canonical.types';

@Controller('foundation/canonical')
export class CanonicalModelController {
  constructor(private readonly canonical: CanonicalModelService) {}

  @Get('kinds')
  kinds() {
    return { kinds: CANONICAL_KINDS };
  }

  @Post('projects/:projectId/ingest')
  ingest(
    @Param('projectId') projectId: string,
    @Body()
    body: {
      payload: unknown;
      rejectOnBlocking?: boolean;
      persistWithIssues?: boolean;
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.canonical.ingest(projectId, body.payload, {
      rejectOnBlocking: body.rejectOnBlocking,
      persistWithIssues: body.persistWithIssues,
      metadata: body.metadata,
    });
  }

  @Get('projects/:projectId/items')
  list(
    @Param('projectId') projectId: string,
    @Query('kind') kind?: string,
  ) {
    if (kind && !CANONICAL_KINDS.includes(kind as CanonicalKind)) {
      return { error: 'unknown kind', kind };
    }
    return kind
      ? this.canonical.listByKind(projectId, kind as CanonicalKind)
      : this.canonical.listAll(projectId);
  }

  @Get('projects/:projectId/items/:kind/:externalId')
  find(
    @Param('projectId') projectId: string,
    @Param('kind') kind: string,
    @Param('externalId') externalId: string,
  ) {
    if (!CANONICAL_KINDS.includes(kind as CanonicalKind)) {
      return { error: 'unknown kind', kind };
    }
    return this.canonical.findByExternalId(projectId, kind as CanonicalKind, externalId);
  }

  @Get('projects/:projectId/items/:kind/:externalId/versions')
  versions(
    @Param('projectId') projectId: string,
    @Param('kind') kind: string,
    @Param('externalId') externalId: string,
  ) {
    if (!CANONICAL_KINDS.includes(kind as CanonicalKind)) {
      return { error: 'unknown kind', kind };
    }
    return this.canonical.listVersions(projectId, kind as CanonicalKind, externalId);
  }

  @Get('projects/:projectId/items/:kind/:externalId/provenance')
  provenance(
    @Param('projectId') projectId: string,
    @Param('kind') kind: string,
    @Param('externalId') externalId: string,
  ) {
    if (!CANONICAL_KINDS.includes(kind as CanonicalKind)) {
      return { error: 'unknown kind', kind };
    }
    return this.canonical.getProvenance(projectId, kind as CanonicalKind, externalId);
  }
}
