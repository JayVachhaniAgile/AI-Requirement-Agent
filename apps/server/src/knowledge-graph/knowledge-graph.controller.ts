import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  type NewEdgeInput,
  KnowledgeGraphService,
} from './knowledge-graph.service';

@Controller('projects/:projectId/kb')
export class KnowledgeGraphController {
  constructor(private readonly graph: KnowledgeGraphService) {}

  /** Assert one or more typed edges between knowledge items. */
  @Post('edges')
  assertEdges(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() body: { edges?: NewEdgeInput[]; actorKey?: string },
  ) {
    if (!body.edges || body.edges.length === 0) {
      throw new BadRequestException('edges must be a non-empty array');
    }
    return this.graph.assertEdges(
      projectId,
      body.edges,
      { key: body.actorKey ?? 'system', type: 'agent' },
    );
  }

  @Delete('edges/:edgeId')
  removeEdge(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('edgeId', ParseUUIDPipe) edgeId: string,
  ) {
    return this.graph.removeEdge(projectId, edgeId);
  }

  @Get('edges')
  edges(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: { sourceId?: string; targetId?: string; relation?: string },
  ) {
    return this.graph.getEdges(projectId, query);
  }

  /** Full graph (nodes + edges) for visualization. */
  @Get('graph')
  fullGraph(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.graph.getGraph(projectId);
  }

  /** BFS neighborhood of an item. */
  @Get('neighbors/:itemId')
  neighbors(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Query() query: { relation?: string; depth?: string },
  ) {
    return this.graph.getNeighbors(projectId, itemId, {
      relation: query.relation,
      depth: query.depth === undefined ? undefined : Number(query.depth),
    });
  }

  /** End-to-end traceability (ancestors + descendants). */
  @Get('trace/:itemId')
  trace(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Query() query: { maxDepth?: string },
  ) {
    return this.graph.trace(projectId, itemId, {
      maxDepth: query.maxDepth === undefined ? undefined : Number(query.maxDepth),
    });
  }

  /** Fused retrieval: structured + keyword + graph + optional semantic. */
  @Get('retrieve')
  retrieve(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: { query?: string; domains?: string; maxItems?: string; depth?: string },
  ) {
    return this.graph.retrieve(projectId, query.query ?? '', {
      domains: query.domains?.split(',').map((d) => d.trim()).filter(Boolean),
      maxItems: query.maxItems === undefined ? undefined : Number(query.maxItems),
      depth: query.depth === undefined ? undefined : Number(query.depth),
    });
  }

  /** KB source snapshot for a document type. */
  @Post('render-document')
  renderDocument(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() body: { documentType?: string },
  ) {
    if (!body.documentType) throw new BadRequestException('documentType is required');
    return this.graph.renderDocument(projectId, body.documentType);
  }
}
