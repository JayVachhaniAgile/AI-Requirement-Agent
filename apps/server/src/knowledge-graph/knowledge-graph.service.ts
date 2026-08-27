import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  KnowledgeEdge,
  KnowledgeEmbedding,
  ProjectContextItem,
} from '../database/entities';
import { ALL_DOMAINS, isContextDomain } from '../project-context/context-domains';
import { digestKnowledgeItems } from '../agents/context-digest';
import type { KnowledgeItemSummary } from '../agents/types';
import { EDGE_RELATIONS, isEdgeRelation } from './edge-taxonomy';
import { LAYERS, layerOf } from './relationship-layers';

export interface NewEdgeInput {
  sourceId: string;
  targetId: string;
  relation: string;
  weight?: number;
  metadata?: Record<string, unknown> | null;
}

export interface EdgeView {
  id: string;
  sourceId: string;
  targetId: string;
  relation: string;
  weight: number;
  producerAgent: string | null;
  commitId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface ItemView {
  id: string;
  projectId: string;
  domain: string;
  externalId: string | null;
  type: string;
  title: string;
  body: string | null;
  status: string;
  version: number;
  producerAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RetrievedItem extends ItemView {
  score: number;
  matchedBy: string[];
}

export interface ImpactNode {
  item: ItemView;
  distance: number;
  relation: string;
}

export interface ImpactAnalysis {
  root: ItemView;
  impacted: ImpactNode[];
  documents: ItemView[];
  risks: ItemView[];
  blastRadius: number;
}

export type PropagationDirection = 'up' | 'down' | 'both';

export interface PropagationResult {
  root: ItemView;
  direction: PropagationDirection;
  depth: number;
  impacted: ImpactNode[];
  documents: ItemView[];
  severity: number;
}

export interface MatrixRow {
  requirement: ItemView;
  story: boolean;
  acceptance: boolean;
  api: boolean;
  dbTable: boolean;
  uiScreen: boolean;
  testCase: boolean;
  coverage: number;
}

export interface TraceabilityMatrix {
  rows: MatrixRow[];
  summary: {
    total: number;
    averageCoverage: number;
    gaps: Array<{ itemId: string; title: string; missing: string[] }>;
  };
}

export interface RelationshipSearchHit extends RetrievedItem {
  relations: Array<{
    relation: string;
    direction: 'out' | 'in';
    other: { id: string; title: string; domain: string };
  }>;
}

export interface LayeredGraph {
  projectId: string;
  layers: Array<{ id: string; label: string; nodes: ItemView[] }>;
  edges: EdgeView[];
}

export interface ConflictPair {
  source: ItemView;
  target: ItemView;
  relation: string;
  reason: Record<string, unknown> | null;
}

interface Adjacency {
  out: Map<string, Array<{ targetId: string; relation: string }>>;
  in: Map<string, Array<{ sourceId: string; relation: string }>>;
}

@Injectable()
export class KnowledgeGraphService {
  private readonly logger = new Logger(KnowledgeGraphService.name);

  /**
   * Service-level cache for parsed embedding vectors.
   * Avoids repeated JSON.parse of large float arrays on every retrieve() call.
   * Key: itemId, Value: pre-parsed Float32Array.
   */
  private readonly embeddingCache = new Map<string, Float32Array>();

  constructor(
    @InjectRepository(ProjectContextItem)
    private readonly itemRepo: Repository<ProjectContextItem>,
    @InjectRepository(KnowledgeEdge)
    private readonly edgeRepo: Repository<KnowledgeEdge>,
    @InjectRepository(KnowledgeEmbedding)
    private readonly embedRepo: Repository<KnowledgeEmbedding>,
  ) {}

  // -------------------------------------------------------------------------
  // Edge CRUD
  // -------------------------------------------------------------------------

  /** Assert one or more edges. Validates both endpoints exist and the relation. */
  async assertEdges(
    projectId: string,
    inputs: NewEdgeInput[],
    actor: { key: string; type?: 'agent' | 'user' | 'system' },
  ): Promise<{ created: number; updated: number; edges: EdgeView[] }> {
    if (inputs.length === 0) throw new BadRequestException('edges must be a non-empty array');
    const itemIds = [...new Set(inputs.flatMap((e) => [e.sourceId, e.targetId]))];
    const items = await this.itemRepo.find({ where: { projectId, id: In(itemIds) } });
    const known = new Set(items.map((i) => i.id));
    for (const input of inputs) {
      if (!isEdgeRelation(input.relation)) {
        throw new BadRequestException(
          `unknown relation '${input.relation}'; expected one of: ${EDGE_RELATIONS.join(', ')}`,
        );
      }
      if (!known.has(input.sourceId) || !known.has(input.targetId)) {
        throw new BadRequestException(
          `edge endpoints must exist in project ${projectId}: ${input.sourceId} -> ${input.targetId}`,
        );
      }
    }

    let created = 0;
    let updated = 0;
    const saved: KnowledgeEdge[] = [];
    for (const input of inputs) {
      const existing = await this.edgeRepo.findOne({
        where: {
          projectId,
          sourceId: input.sourceId,
          targetId: input.targetId,
          relation: input.relation,
        },
      });
      const edge = existing ?? this.edgeRepo.create({ id: randomUUID(), projectId });
      edge.sourceId = input.sourceId;
      edge.targetId = input.targetId;
      edge.relation = input.relation;
      edge.weight = input.weight ?? 1;
      edge.producerAgent = actor.key;
      edge.metadata = input.metadata ? JSON.stringify(input.metadata) : edge.metadata;
      if (existing) updated += 1;
      else created += 1;
      saved.push(await this.edgeRepo.save(edge));
    }
    return { created, updated, edges: saved.map(toEdgeView) };
  }

  async removeEdge(projectId: string, edgeId: string): Promise<{ removed: boolean }> {
    const edge = await this.edgeRepo.findOne({ where: { id: edgeId, projectId } });
    if (!edge) throw new NotFoundException(`Edge ${edgeId} not found`);
    await this.edgeRepo.delete({ id: edgeId, projectId });
    return { removed: true };
  }

  async getEdges(
    projectId: string,
    filters: { sourceId?: string; targetId?: string; relation?: string } = {},
  ): Promise<EdgeView[]> {
    const where: Record<string, unknown> = { projectId };
    if (filters.sourceId) where.sourceId = filters.sourceId;
    if (filters.targetId) where.targetId = filters.targetId;
    if (filters.relation) {
      if (!isEdgeRelation(filters.relation)) {
        throw new BadRequestException(`unknown relation '${filters.relation}'`);
      }
      where.relation = filters.relation;
    }
    const rows = await this.edgeRepo.find({ where: where as never, order: { createdAt: 'ASC' } });
    return rows.map(toEdgeView);
  }

  // -------------------------------------------------------------------------
  // Graph queries
  // -------------------------------------------------------------------------

  async getGraph(projectId: string): Promise<{ projectId: string; nodes: ItemView[]; edges: EdgeView[] }> {
    const [nodes, edges] = await Promise.all([
      this.itemRepo.find({ where: { projectId, status: Not('SUPERSEDED') } }),
      this.edgeRepo.find({ where: { projectId } }),
    ]);
    return { projectId, nodes: nodes.map(toItemView), edges: edges.map(toEdgeView) };
  }

  /** BFS neighborhood of an item (undirected) up to `depth` hops. */
  async getNeighbors(
    projectId: string,
    itemId: string,
    options: { relation?: string; depth?: number } = {},
  ): Promise<{ itemId: string; neighbors: Array<{ node: ItemView; relation: string; direction: 'out' | 'in'; distance: number }> }> {
    await this.requireItem(projectId, itemId);
    const depth = Math.min(Math.max(options.depth ?? 1, 1), 5);
    const adjacency = await this.buildAdjacency(projectId);
    const neighbors: Array<{ node: ItemView; relation: string; direction: 'out' | 'in'; distance: number }> = [];
    const seen = new Set<string>([itemId]);
    const queue: Array<{ id: string; distance: number }> = [{ id: itemId, distance: 0 }];
    const nodeCache = new Map<string, ItemView>();

    while (queue.length > 0) {
      const { id, distance } = queue.shift()!;
      if (distance >= depth) continue;
      const entries = [
        ...(adjacency.out.get(id) ?? []).map((e) => ({ nodeId: e.targetId, relation: e.relation, direction: 'out' as const })),
        ...(adjacency.in.get(id) ?? []).map((e) => ({ nodeId: e.sourceId, relation: e.relation, direction: 'in' as const })),
      ];
      for (const entry of entries) {
        if (options.relation && entry.relation !== options.relation) continue;
        if (!seen.has(entry.nodeId)) {
          seen.add(entry.nodeId);
          const node = await this.loadItemCached(projectId, entry.nodeId, nodeCache);
          if (node) neighbors.push({ node, relation: entry.relation, direction: entry.direction, distance: distance + 1 });
          queue.push({ id: entry.nodeId, distance: distance + 1 });
        }
      }
    }
    return { itemId, neighbors };
  }

  /** Directed traceability: ancestors (up) and descendants (down) of an item. */
  async trace(
    projectId: string,
    itemId: string,
    options: { maxDepth?: number } = {},
  ): Promise<{
    root: ItemView;
    up: Array<{ node: ItemView; relation: string; depth: number }>;
    down: Array<{ node: ItemView; relation: string; depth: number }>;
  }> {
    const root = await this.requireItem(projectId, itemId);
    const maxDepth = Math.min(Math.max(options.maxDepth ?? 5, 1), 10);
    const adjacency = await this.buildAdjacency(projectId);
    const nodeCache = new Map<string, ItemView>([[root.id, root]]);

    const up = await this.traceDirection(projectId, adjacency, itemId, 'up', maxDepth, nodeCache);
    const down = await this.traceDirection(projectId, adjacency, itemId, 'down', maxDepth, nodeCache);
    return { root, up, down };
  }

  // -------------------------------------------------------------------------
  // Retrieval
  // -------------------------------------------------------------------------

  /**
   * Fused retrieval: structured domain filter + keyword match + graph
   * neighborhood boost + optional semantic cosine (when `embedding` is
   * supplied and stored embeddings exist). Deterministic and testable.
   */
  async retrieve(
    projectId: string,
    query: string,
    options: { domains?: string[]; maxItems?: number; depth?: number; embedding?: number[] } = {},
  ): Promise<{ projectId: string; query: string; items: RetrievedItem[] }> {
    const domains =
      options.domains && options.domains.length > 0
        ? options.domains.filter(isContextDomain)
        : [...ALL_DOMAINS];
    const maxItems = Math.min(Math.max(options.maxItems ?? 50, 1), 200);
    const depth = Math.min(Math.max(options.depth ?? 1, 0), 5);
    const needle = (query ?? '').trim().toLowerCase();

    const items = await this.itemRepo.find({
      where: { projectId, domain: In(domains), status: Not('SUPERSEDED') },
      order: { updatedAt: 'DESC' },
    });

    const scores = new Map<string, { score: number; matchedBy: string[] }>();
    const seeds: string[] = [];
    for (const item of items) {
      const entry = { score: 0, matchedBy: [] as string[] };
      if (needle) {
        const haystack = `${item.title} ${item.body ?? ''} ${item.externalId ?? ''}`.toLowerCase();
        if (haystack.includes(needle)) {
          entry.score += 0.5;
          entry.matchedBy.push('keyword');
          seeds.push(item.id);
        }
      }
      scores.set(item.id, entry);
    }

    // Graph boost: neighbors of keyword-matched seeds (context around matches).
    if (seeds.length > 0 && depth > 0) {
      const adjacency = await this.buildAdjacency(projectId);
      for (const seed of seeds) {
        for (const neighborId of this.neighborhood(adjacency, seed, depth)) {
          const entry = scores.get(neighborId);
          if (entry && !entry.matchedBy.includes('keyword')) {
            entry.score += 0.3;
            entry.matchedBy.push('graph');
          }
        }
      }
    }

    // Semantic boost: cosine similarity against stored embeddings.
    // Parsed Float32Array vectors are cached in-memory to avoid blocking
    // JSON.parse on every search request (1536-element arrays per item).
    if (options.embedding && options.embedding.length > 0) {
      const itemIds = items.map((i) => i.id);
      const uncachedIds = itemIds.filter((id) => !this.embeddingCache.has(id));

      if (uncachedIds.length > 0) {
        const embeddings = await this.embedRepo.find({
          where: { itemId: In(uncachedIds) },
        });
        for (const emb of embeddings) {
          if (!emb.embedding) continue;
          const parsed = parseEmbeddingToFloat32(emb.embedding as string);
          if (parsed) this.embeddingCache.set(emb.itemId, parsed);
        }
      }

      for (const item of items) {
        const vector = this.embeddingCache.get(item.id);
        if (!vector) continue;
        const sim = cosineSimilarityF32(options.embedding, vector);
        const entry = scores.get(item.id);
        if (entry && sim > 0) {
          entry.score += 0.2 * sim;
          entry.matchedBy.push('semantic');
        }
      }
    }

    const ranked = items
      .map((item) => {
        const { score, matchedBy } = scores.get(item.id) ?? { score: 0, matchedBy: [] as string[] };
        return { ...toItemView(item), score, matchedBy };
      })
      .sort((a, b) => b.score - a.score || b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, maxItems);

    return { projectId, query: query ?? '', items: ranked };
  }

  /** Retrieval + AGENT_DIGEST_CONFIG tiering — the prompt-builder ingest path. */
  async getDigestForConsumer(
    projectId: string,
    consumerAgent: string,
    query = '',
  ): Promise<KnowledgeItemSummary[]> {
    const { items } = await this.retrieve(projectId, query, { maxItems: 200 });
    const summaries: KnowledgeItemSummary[] = items.map((i) => ({
      externalId: i.externalId,
      type: i.type,
      title: i.title,
      description: i.body,
      status: i.status,
      source: i.producerAgent ?? undefined,
    }));
    return digestKnowledgeItems(summaries, consumerAgent);
  }

  /** KB source snapshot for a document type (generation runs via doc services). */
  async renderDocument(projectId: string, documentType: string): Promise<{
    projectId: string;
    documentType: string;
    items: Record<string, ItemView[]>;
    edges: EdgeView[];
    traceableItemCount: number;
  }> {
    const { nodes, edges } = await this.getGraph(projectId);
    const grouped: Record<string, ItemView[]> = {};
    for (const node of nodes) {
      (grouped[node.domain] ??= []).push(node);
    }
    const traceable = new Set<string>();
    for (const edge of edges) {
      traceable.add(edge.sourceId);
      traceable.add(edge.targetId);
    }
    return {
      projectId,
      documentType,
      items: grouped,
      edges,
      traceableItemCount: traceable.size,
    };
  }


  // -------------------------------------------------------------------------
  // Relationship graph (layers, impact, propagation, matrix, search)
  // -------------------------------------------------------------------------

  /** Layered graph payload for the relationship visualization. */
  async getLayeredGraph(
    projectId: string,
    layerIds?: string[],
  ): Promise<LayeredGraph> {
    const { nodes, edges } = await this.getGraph(projectId);
    const byLayer: Record<string, ItemView[]> = {};
    const included = new Set<string>();
    for (const node of nodes) {
      const layer = layerOf(node.domain);
      if (layerIds && !layerIds.includes(layer)) continue;
      included.add(node.id);
      (byLayer[layer] ??= []).push(node);
    }
    const filteredEdges = edges.filter(
      (e) => included.has(e.sourceId) && included.has(e.targetId),
    );
    return {
      projectId,
      layers: LAYERS.map((l) => ({
        id: l.id,
        label: l.label,
        nodes: byLayer[l.id] ?? [],
      })).filter((l) => !layerIds || layerIds.includes(l.id)),
      edges: filteredEdges,
    };
  }

  /**
   * Impact analysis: forward closure from a seed node over outgoing edges,
   * then project onto affected documents (domain `document_summaries`) and
   * exposed risks (domain `risks`).
   */
  async getImpactAnalysis(
    projectId: string,
    itemId: string,
    options: { maxDepth?: number } = {},
  ): Promise<ImpactAnalysis> {
    const root = await this.requireItem(projectId, itemId);
    const maxDepth = Math.min(Math.max(options.maxDepth ?? 10, 1), 25);
    const adjacency = await this.buildAdjacency(projectId);
    const cache = new Map<string, ItemView>([[root.id, root]]);
    const impacted: ImpactNode[] = [];
    const seen = new Set<string>([itemId]);
    const queue: Array<{ id: string; distance: number }> = [{ id: itemId, distance: 0 }];
    while (queue.length > 0) {
      const { id, distance } = queue.shift()!;
      if (distance >= maxDepth) continue;
      for (const edge of adjacency.out.get(id) ?? []) {
        if (seen.has(edge.targetId)) continue;
        seen.add(edge.targetId);
        const node = await this.loadItemCached(projectId, edge.targetId, cache);
        if (node) {
          impacted.push({ item: node, distance: distance + 1, relation: edge.relation });
          queue.push({ id: edge.targetId, distance: distance + 1 });
        }
      }
    }
    const documents = impacted.filter((n) => n.item.domain === 'document_summaries').map((n) => n.item);
    const risks = impacted.filter((n) => n.item.domain === 'risks').map((n) => n.item);
    return { root, impacted, documents, risks, blastRadius: impacted.length };
  }

  /** Change propagation: parameterized closure with a severity estimate. */
  async propagate(
    projectId: string,
    itemId: string,
    options: { direction?: PropagationDirection; depth?: number; relations?: string[] } = {},
  ): Promise<PropagationResult> {
    const root = await this.requireItem(projectId, itemId);
    const direction = options.direction ?? 'down';
    const depth = Math.min(Math.max(options.depth ?? 5, 1), 10);
    const relationFilter: string[] | null =
      options.relations?.filter((r) => isEdgeRelation(r)) ?? null;
    const adjacency = await this.buildAdjacency(projectId);
    const cache = new Map<string, ItemView>([[root.id, root]]);
    const impacted: ImpactNode[] = [];
    const seen = new Set<string>([itemId]);
    const queue: Array<{ id: string; distance: number }> = [{ id: itemId, distance: 0 }];
    while (queue.length > 0) {
      const { id, distance } = queue.shift()!;
      if (distance >= depth) continue;
      const outgoing =
        direction === 'down' || direction === 'both' ? (adjacency.out.get(id) ?? []) : [];
      const incoming =
        direction === 'up' || direction === 'both' ? (adjacency.in.get(id) ?? []) : [];
      const entries = [
        ...outgoing.map((e) => ({ nodeId: e.targetId, relation: e.relation })),
        ...incoming.map((e) => ({ nodeId: e.sourceId, relation: e.relation })),
      ];
      for (const entry of entries) {
        if (relationFilter && !relationFilter.includes(entry.relation)) continue;
        if (seen.has(entry.nodeId)) continue;
        seen.add(entry.nodeId);
        const node = await this.loadItemCached(projectId, entry.nodeId, cache);
        if (node) {
          impacted.push({ item: node, distance: distance + 1, relation: entry.relation });
          queue.push({ id: entry.nodeId, distance: distance + 1 });
        }
      }
    }
    const documents = impacted.filter((n) => n.item.domain === 'document_summaries').map((n) => n.item);
    const deliveryLeaves = impacted.filter((n) => layerOf(n.item.domain) === 'delivery');
    return {
      root,
      direction,
      depth,
      impacted,
      documents,
      severity: deliveryLeaves.length + documents.length,
    };
  }

  /**
   * Traceability matrix: per requirement, which downstream artifacts exist
   * (story, acceptance criteria, API, DB table, UI screen, test case).
   * Evaluates 1-hop and 2-hop outgoing relations for comprehensive coverage.
   */
  async getTraceabilityMatrix(projectId: string): Promise<TraceabilityMatrix> {
    const items = await this.itemRepo.find({
      where: { projectId, status: Not('SUPERSEDED') },
    });
    const adjacency = await this.buildAdjacency(projectId);
    const requirements = items.filter(
      (i) => i.domain === 'functional_requirements' || i.domain === 'non_functional_requirements',
    );

    const rows: MatrixRow[] = requirements.map((req) => {
      const outgoing = adjacency.out.get(req.id) ?? [];
      const byRelation = new Map<string, string[]>();
      for (const edge of outgoing) {
        const list = byRelation.get(edge.relation) ?? [];
        list.push(edge.targetId);
        byRelation.set(edge.relation, list);

        // 2-hop traversal via intermediate nodes (e.g. User Stories)
        const subOutgoing = adjacency.out.get(edge.targetId) ?? [];
        for (const subEdge of subOutgoing) {
          const subList = byRelation.get(subEdge.relation) ?? [];
          subList.push(subEdge.targetId);
          byRelation.set(subEdge.relation, subList);
        }
      }
      const story = (byRelation.get('elaborated_by') ?? []).length > 0;
      const api = (byRelation.get('implemented_by') ?? []).length > 0;
      const dbTable = (byRelation.get('maps_to') ?? []).length > 0;
      const uiScreen = (byRelation.get('rendered_by') ?? []).length > 0;
      const testCase = (byRelation.get('verified_by') ?? []).length > 0;
      let acceptance = false;
      if (story) {
        for (const storyId of byRelation.get('elaborated_by') ?? []) {
          if ((adjacency.out.get(storyId) ?? []).some((e) => e.relation === 'defines')) {
            acceptance = true;
            break;
          }
        }
      }
      const flags = { story, acceptance, api, dbTable, uiScreen, testCase };
      const covered = Object.values(flags).filter(Boolean).length;
      return {
        requirement: toItemView(req),
        ...flags,
        coverage: Math.round((covered / 6) * 100),
      };
    });

    const columns = ['story', 'acceptance', 'api', 'dbTable', 'uiScreen', 'testCase'] as const;
    const gaps = rows
      .filter((r) => r.coverage < 100)
      .map((r) => ({
        itemId: r.requirement.id,
        title: r.requirement.title,
        missing: columns.filter((c) => !r[c]),
      }));
    const averageCoverage = rows.length
      ? Math.round(rows.reduce((sum, r) => sum + r.coverage, 0) / rows.length)
      : 0;
    return { rows, summary: { total: rows.length, averageCoverage, gaps } };
  }

  /** Relationship-aware search: fused retrieval + 1-hop relation context. */
  async relationshipSearch(
    projectId: string,
    query: string,
    options: { domains?: string[]; maxItems?: number; depth?: number } = {},
  ): Promise<{ projectId: string; query: string; items: RelationshipSearchHit[] }> {
    const { items } = await this.retrieve(projectId, query, options);
    const adjacency = await this.buildAdjacency(projectId);
    const cache = new Map<string, ItemView>();
    const hits: RelationshipSearchHit[] = [];
    for (const item of items) {
      const relations: RelationshipSearchHit['relations'] = [];
      const pushRelation = async (
        otherId: string,
        relation: string,
        direction: 'out' | 'in',
      ): Promise<void> => {
        if (relations.length >= 5) return;
        const other = await this.loadItemCached(projectId, otherId, cache);
        if (other) {
          relations.push({ relation, direction, other: { id: other.id, title: other.title, domain: other.domain } });
        }
      };
      for (const edge of adjacency.out.get(item.id) ?? []) {
        await pushRelation(edge.targetId, edge.relation, 'out');
      }
      for (const edge of adjacency.in.get(item.id) ?? []) {
        await pushRelation(edge.sourceId, edge.relation, 'in');
      }
      hits.push({ ...item, relations });
    }
    return { projectId, query, items: hits };
  }


  /** All `conflicts_with` pairs in the project (for validation/debate). */
  async getConflictPairs(projectId: string): Promise<ConflictPair[]> {
    const edges = await this.edgeRepo.find({
      where: { projectId, relation: 'conflicts_with' },
      order: { createdAt: 'ASC' },
    });
    const itemIds = [...new Set(edges.flatMap((e) => [e.sourceId, e.targetId]))];
    if (itemIds.length === 0) return [];
    const items = await this.itemRepo.find({ where: { projectId, id: In(itemIds) } });
    const byId = new Map(items.map((i) => [i.id, i]));
    const pairs: ConflictPair[] = [];
    for (const edge of edges) {
      const source = byId.get(edge.sourceId);
      const target = byId.get(edge.targetId);
      if (source && target) {
        pairs.push({
          source: toItemView(source),
          target: toItemView(target),
          relation: edge.relation,
          reason: safeParse(edge.metadata),
        });
      }
    }
    return pairs;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async buildAdjacency(projectId: string): Promise<Adjacency> {
    const edges = await this.edgeRepo.find({ where: { projectId } });
    const out = new Map<string, Array<{ targetId: string; relation: string }>>();
    const inMap = new Map<string, Array<{ sourceId: string; relation: string }>>();
    for (const edge of edges) {
      push(out, edge.sourceId, { targetId: edge.targetId, relation: edge.relation });
      push(inMap, edge.targetId, { sourceId: edge.sourceId, relation: edge.relation });
    }
    return { out, in: inMap };
  }

  private neighborhood(adjacency: Adjacency, start: string, depth: number): string[] {
    const result: string[] = [];
    const seen = new Set<string>([start]);
    const queue: Array<{ id: string; distance: number }> = [{ id: start, distance: 0 }];
    while (queue.length > 0) {
      const { id, distance } = queue.shift()!;
      if (distance >= depth) continue;
      const targets = [
        ...(adjacency.out.get(id) ?? []).map((e) => e.targetId),
        ...(adjacency.in.get(id) ?? []).map((e) => e.sourceId),
      ];
      for (const target of targets) {
        if (!seen.has(target)) {
          seen.add(target);
          result.push(target);
          queue.push({ id: target, distance: distance + 1 });
        }
      }
    }
    return result;
  }

  private async traceDirection(
    projectId: string,
    adjacency: Adjacency,
    start: string,
    direction: 'up' | 'down',
    maxDepth: number,
    nodeCache: Map<string, ItemView>,
  ): Promise<Array<{ node: ItemView; relation: string; depth: number }>> {
    const result: Array<{ node: ItemView; relation: string; depth: number }> = [];
    const seen = new Set<string>([start]);
    const queue: Array<{ id: string; depth: number }> = [{ id: start, depth: 0 }];
    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (depth >= maxDepth) continue;
      const next =
        direction === 'up'
          ? (adjacency.in.get(id) ?? []).map((e) => ({ nodeId: e.sourceId, relation: e.relation }))
          : (adjacency.out.get(id) ?? []).map((e) => ({ nodeId: e.targetId, relation: e.relation }));
      for (const entry of next) {
        if (seen.has(entry.nodeId)) continue;
        seen.add(entry.nodeId);
        const node = await this.loadItemCached(projectId, entry.nodeId, nodeCache);
        if (node) result.push({ node, relation: entry.relation, depth: depth + 1 });
        queue.push({ id: entry.nodeId, depth: depth + 1 });
      }
    }
    return result;
  }

  private async loadItemCached(
    projectId: string,
    itemId: string,
    cache: Map<string, ItemView>,
  ): Promise<ItemView | null> {
    const cached = cache.get(itemId);
    if (cached) return cached;
    const item = await this.itemRepo.findOne({ where: { projectId, id: itemId } });
    if (!item) return null;
    const view = toItemView(item);
    cache.set(itemId, view);
    return view;
  }

  private async requireItem(projectId: string, itemId: string): Promise<ItemView> {
    const item = await this.itemRepo.findOne({ where: { projectId, id: itemId } });
    if (!item) throw new NotFoundException(`Knowledge item ${itemId} not found`);
    return toItemView(item);
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}

function toItemView(item: ProjectContextItem): ItemView {
  return {
    id: item.id,
    projectId: item.projectId,
    domain: item.domain,
    externalId: item.externalId,
    type: item.type,
    title: item.title,
    body: item.body,
    status: item.status,
    version: item.version,
    producerAgent: item.producerAgent,
    metadata: safeParse(item.metadata),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function toEdgeView(edge: KnowledgeEdge): EdgeView {
  return {
    id: edge.id,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    relation: edge.relation,
    weight: edge.weight,
    producerAgent: edge.producerAgent,
    commitId: edge.commitId,
    metadata: safeParse(edge.metadata),
    createdAt: edge.createdAt,
  };
}

function safeParse(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseEmbedding(raw: string): number[] | null {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((n) => typeof n === 'number') ? parsed : null;
  } catch {
    return null;
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Parse a JSON embedding string into a typed Float32Array.
 * Returns null on malformed input. Used by the in-memory vector cache
 * so that large embedding arrays are only JSON.parse'd once per item.
 */
function parseEmbeddingToFloat32(raw: string): Float32Array | null {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    if (!parsed.every((n) => typeof n === 'number')) return null;
    return Float32Array.from(parsed);
  } catch {
    return null;
  }
}

/**
 * Cosine similarity between a plain number[] query vector and a cached
 * Float32Array stored vector.  Avoids allocating a new number[] on each
 * comparison so this is O(n) with no extra heap pressure.
 */
function cosineSimilarityF32(a: number[], b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
