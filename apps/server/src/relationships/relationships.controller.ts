import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { KnowledgeGraphService } from '../knowledge-graph/knowledge-graph.service';
import { LAYERS, DOMAIN_LAYER, isLayerId } from '../knowledge-graph/relationship-layers';
import { EDGE_RELATIONS } from '../knowledge-graph/edge-taxonomy';

@Controller('projects/:projectId/relationships')
export class RelationshipsController {
  constructor(private readonly graph: KnowledgeGraphService) {}

  /** Node kinds, relation taxonomy, and layer mapping for the UI. */
  @Get('types')
  types() {
    const domains = Object.entries(DOMAIN_LAYER)
      .map(([domain, layer]) => ({ domain, layer }))
      .sort((a, b) => a.layer.localeCompare(b.layer) || a.domain.localeCompare(b.domain));
    return { layers: LAYERS, domains, relations: EDGE_RELATIONS };
  }

  /** Layered graph payload for visualization (`?layers=business,product`). */
  @Get('graph')
  layeredGraph(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: { layers?: string },
  ) {
    const layerIds = split(query.layers);
    if (layerIds && layerIds.some((l) => !isLayerId(l))) {
      throw new BadRequestException(`unknown layer id; expected one of: ${LAYERS.map((l) => l.id).join(', ')}`);
    }
    return this.graph.getLayeredGraph(projectId, layerIds);
  }

  /** All `conflicts_with` pairs (surfaced to validation/debate). */
  @Get('conflicts')
  conflicts(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.graph.getConflictPairs(projectId);
  }

  /** Traceability: up = referencing items, down = referenced items. */
  @Get(':itemId/trace')
  trace(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Query() query: { maxDepth?: string },
  ) {
    return this.graph.trace(projectId, itemId, {
      maxDepth: query.maxDepth === undefined ? undefined : Number(query.maxDepth),
    });
  }

  /** Impact analysis: forward closure + affected documents/risks. */
  @Get(':itemId/impact')
  impact(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Query() query: { maxDepth?: string },
  ) {
    return this.graph.getImpactAnalysis(projectId, itemId, {
      maxDepth: query.maxDepth === undefined ? undefined : Number(query.maxDepth),
    });
  }

  /** Change propagation with severity estimate. */
  @Get(':itemId/propagate')
  propagate(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Query() query: { direction?: string; depth?: string; relations?: string },
  ) {
    const direction = query.direction as 'up' | 'down' | 'both' | undefined;
    if (direction && !['up', 'down', 'both'].includes(direction)) {
      throw new BadRequestException("direction must be 'up', 'down', or 'both'");
    }
    return this.graph.propagate(projectId, itemId, {
      direction,
      depth: query.depth === undefined ? undefined : Number(query.depth),
      relations: split(query.relations),
    });
  }

  /** Traceability matrix with coverage + gaps. */
  @Get('matrix')
  matrix(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.graph.getTraceabilityMatrix(projectId);
  }

  /** Relationship-aware search. */
  @Get('search')
  search(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: { query?: string; domains?: string; maxItems?: string },
  ) {
    return this.graph.relationshipSearch(projectId, query.query ?? '', {
      domains: split(query.domains),
      maxItems: query.maxItems === undefined ? undefined : Number(query.maxItems),
    });
  }
}

function split(raw?: string): string[] | undefined {
  if (!raw) return undefined;
  return raw.split(',').map((v) => v.trim()).filter(Boolean);
}
