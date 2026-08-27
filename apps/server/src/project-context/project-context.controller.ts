import {
  BadRequestException,
  Body,
  Controller,
  Get,
  MessageEvent,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { map } from 'rxjs';
import {
  type CommitRequest,
  ProjectContextService,
} from './project-context.service';
import { ProjectContextEventsService } from './project-context-events.service';

@Controller('projects/:projectId/context')
export class ProjectContextController {
  constructor(
    private readonly context: ProjectContextService,
    private readonly events: ProjectContextEventsService,
  ) {}

  /** Domain-filtered read view of the live context. */
  @Get()
  view(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query()
    query: {
      domains?: string;
      includeSuperseded?: string;
      updatedSince?: string;
    },
  ) {
    return this.context.getView(projectId, {
      domains: splitDomains(query.domains),
      includeSuperseded: query.includeSuperseded === 'true',
      updatedSince: query.updatedSince,
    });
  }

  /** Supported domains + per-domain item counts. */
  @Get('domains')
  domains(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.context.getDomainStats(projectId);
  }

  /** Consumer-specific context digest for prompt building. */
  @Get('digest')
  digest(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: { consumerAgent?: string; domains?: string },
  ) {
    if (!query.consumerAgent) {
      throw new BadRequestException('consumerAgent is required');
    }
    return this.context.getDigest(projectId, query.consumerAgent, {
      domains: splitDomains(query.domains),
    });
  }

  /** Fetch one item; `?version=N` reads an immutable snapshot. */
  @Get('items/:domain/:externalId')
  item(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('domain') domain: string,
    @Param('externalId') externalId: string,
    @Query('version', new ParseIntPipe({ optional: true })) version?: number,
  ) {
    return this.context.getItem(projectId, domain, externalId, version);
  }

  /** Snapshot history for an item (by itemId or domain+externalId). */
  @Get('versions')
  versions(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: { itemId?: string; domain?: string; externalId?: string },
  ) {
    return this.context.getVersions(projectId, query);
  }

  /** Append-only commit log (newest first). */
  @Get('commits')
  commits(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: { limit?: string; before?: string },
  ) {
    const limit = query.limit === undefined ? 50 : Number(query.limit);
    return this.context.getCommits(projectId, limit, query.before);
  }

  /** Atomically apply a context commit (agents write through this). */
  @Post('commits')
  commit(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() body: CommitRequest,
  ) {
    return this.context.applyCommit(projectId, body);
  }

  /** Idempotent seed of `project_context_items` from legacy knowledge_items. */
  @Post('backfill')
  backfill(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.context.backfill(projectId);
  }

  /** Server-Sent Events stream of context deltas for this project. */
  @Sse('stream')
  stream(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.events.onProject(projectId).pipe(
      map((delta) => ({ data: delta }) as MessageEvent),
    );
  }
}

function splitDomains(raw?: string): string[] | undefined {
  if (!raw) return undefined;
  return raw
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
}
