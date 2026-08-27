import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  Artifact,
  ArtifactDependency,
} from '../../database/entities';
import {
  buildAdjacency,
  reachableDownstream,
  reachableUpstream,
  wouldCreateCycle,
} from './artifact-graph';
import {
  DEPENDENCY_TYPES,
  isDependencyType,
  type DependencyGraph,
  type DependencyPath,
  type DependencyRecord,
  type DependencyType,
  type TraversalOptions,
} from './artifact-dependency.types';

export interface CreateDependencyInput {
  projectId: string;
  sourceArtifactId: string;
  targetArtifactId: string;
  dependencyType: DependencyType;
  weight?: number;
  confidence?: number;
  sourceReference?: string;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateDependencyInput {
  dependencyType?: DependencyType;
  weight?: number;
  confidence?: number | null;
  sourceReference?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface GraphValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * ArtifactDependencyService (Phase 4) — first-class dependency graph.
 *
 * Built on the existing `artifact_dependencies` table (no graph DB). Owns:
 *   - CRUD on dependencies
 *   - directed traversal (direct, upstream, downstream, recursive)
 *   - graph validation (missing, self, duplicate, cycle, stale, invalid type)
 *   - per-project graph retrieval
 *
 * The legacy `ArtifactRegistryService.addDependency` keeps working as a
 * passthrough so no caller breaks.
 */
@Injectable()
export class ArtifactDependencyService {
  private readonly logger = new Logger(ArtifactDependencyService.name);

  constructor(
    @InjectRepository(ArtifactDependency)
    private readonly depRepo: Repository<ArtifactDependency>,
    @InjectRepository(Artifact)
    private readonly artifactRepo: Repository<Artifact>,
  ) {}

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  async create(input: CreateDependencyInput): Promise<ArtifactDependency> {
    this.assertValidInput(input);
    const projectId = input.projectId ?? (await this.getProjectIdForArtifact(input.sourceArtifactId));
    await this.assertArtifactsExist(projectId, input.sourceArtifactId, input.targetArtifactId);
    await this.assertNoCycle(input.sourceArtifactId, input.targetArtifactId);
    await this.assertNoDuplicate(
      projectId,
      input.sourceArtifactId,
      input.targetArtifactId,
      input.dependencyType,
    );

    const row = this.depRepo.create({
      id: randomUUID(),
      projectId,
      sourceArtifactId: input.sourceArtifactId,
      targetArtifactId: input.targetArtifactId,
      relation: input.dependencyType,
      weight: input.weight ?? 1,
      confidence: input.confidence ?? null,
      sourceReference: input.sourceReference ?? null,
      producer: input.createdBy ?? null,
      createdBy: input.createdBy ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    });
    const saved = await this.depRepo.save(row);
    this.logger.debug(
      `Dependency ${saved.id} created: ${input.sourceArtifactId} -[${input.dependencyType}]-> ${input.targetArtifactId}`,
    );
    return saved;
  }

  async update(id: string, input: UpdateDependencyInput): Promise<ArtifactDependency> {
    const row = await this.depRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Dependency '${id}' not found`);
    if (input.dependencyType !== undefined) {
      if (!isDependencyType(input.dependencyType)) {
        throw new BadRequestException(`Unknown dependency type '${input.dependencyType}'`);
      }
      row.relation = input.dependencyType;
    }
    if (input.weight !== undefined) row.weight = input.weight;
    if (input.confidence !== undefined) row.confidence = input.confidence;
    if (input.sourceReference !== undefined) row.sourceReference = input.sourceReference;
    if (input.metadata !== undefined) {
      row.metadata = input.metadata ? JSON.stringify(input.metadata) : null;
    }
    return this.depRepo.save(row);
  }

  async delete(id: string): Promise<void> {
    const row = await this.depRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Dependency '${id}' not found`);
    await this.depRepo.delete(row.id);
  }

  async getById(id: string): Promise<ArtifactDependency> {
    const row = await this.depRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Dependency '${id}' not found`);
    return row;
  }

  list(projectId: string, dependencyType?: DependencyType): Promise<ArtifactDependency[]> {
    return this.depRepo.find({
      where: dependencyType ? { projectId, relation: dependencyType } : { projectId },
      order: { createdAt: 'ASC' },
    });
  }

  // -------------------------------------------------------------------------
  // Traversal
  // -------------------------------------------------------------------------

  /** Outgoing edges from `artifactId` (downstream = depends-on targets). */
  async getDirectDependencies(
    artifactId: string,
    options: TraversalOptions = {},
  ): Promise<ArtifactDependency[]> {
    const edges = await this.depRepo.find({ where: { sourceArtifactId: artifactId } });
    return this.filter(edges, options);
  }

  /** Incoming edges to `artifactId` (upstream = dependents = things that depend on me). */
  async getDependents(
    artifactId: string,
    options: TraversalOptions = {},
  ): Promise<ArtifactDependency[]> {
    const edges = await this.depRepo.find({ where: { targetArtifactId: artifactId } });
    return this.filter(edges, options);
  }

  /** Recursive downstream — every artifact `artifactId` transitively depends on. */
  async getDownstream(
    artifactId: string,
    options: TraversalOptions = {},
  ): Promise<string[]> {
    const edges = await this.edges();
    const filtered = this.filter(edges, options);
    return [
      ...reachableDownstream(
        filtered as unknown as Parameters<typeof reachableDownstream>[0],
        artifactId,
        options.maxDepth ?? Infinity,
      ),
    ];
  }

  /** Recursive upstream — every artifact that transitively depends on `artifactId`. */
  async getUpstream(
    artifactId: string,
    options: TraversalOptions = {},
  ): Promise<string[]> {
    const edges = await this.edges();
    const filtered = this.filter(edges, options);
    return [
      ...reachableUpstream(
        filtered as unknown as Parameters<typeof reachableUpstream>[0],
        artifactId,
        options.maxDepth ?? Infinity,
      ),
    ];
  }

  /**
   * Compute every directed path from `artifactId` to any reachable target.
   * DFS with backtracking; bounded by `maxDepth` to avoid exponential blow-up.
   */
  async getPaths(
    artifactId: string,
    options: TraversalOptions = {},
  ): Promise<DependencyPath[]> {
    const edges = await this.edges();
    const filtered = this.filter(edges, options);
    const records = filtered.map(toDependencyRecord);
    const bySource = new Map<string, DependencyRecord[]>();
    for (const edge of records) {
      const list = bySource.get(edge.sourceArtifactId) ?? [];
      list.push(edge);
      bySource.set(edge.sourceArtifactId, list);
    }
    const out: DependencyPath[] = [];
    const initialPath: DependencyRecord[] = [];
    const visit = (
      current: string,
      depth: number,
      path: DependencyRecord[],
      visited: Set<string>,
    ): void => {
      if (depth >= (options.maxDepth ?? 10)) return;
      const next = bySource.get(current) ?? [];
      for (const edge of next) {
        if (visited.has(edge.targetArtifactId)) continue;
        visited.add(edge.targetArtifactId);
        const extendedPath = [...path, edge];
        out.push({
          artifactId,
          edges: extendedPath,
          depth: extendedPath.length,
        });
        visit(edge.targetArtifactId, depth + 1, extendedPath, visited);
        visited.delete(edge.targetArtifactId);
      }
    };
    visit(artifactId, 0, initialPath, new Set([artifactId]));
    return out;
  }

  async getGraph(projectId: string): Promise<DependencyGraph> {
    const [artifacts, edges] = await Promise.all([
      this.artifactRepo.find({ where: { projectId } }),
      this.depRepo.find({ where: { projectId } }),
    ]);
    const degree: DependencyGraph['degree'] = {};
    for (const a of artifacts) {
      degree[a.id] = { in: 0, out: 0 };
    }
    for (const edge of edges) {
      degree[edge.sourceArtifactId] ??= { in: 0, out: 0 };
      degree[edge.targetArtifactId] ??= { in: 0, out: 0 };
      degree[edge.sourceArtifactId].out += 1;
      degree[edge.targetArtifactId].in += 1;
    }
    return {
      projectId,
      edges: edges.map(toDependencyRecord),
      artifacts: artifacts.map((a) => ({ id: a.id, type: a.type, title: a.title })),
      degree,
    };
  }

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  /**
   * Validate the full project graph: missing endpoints, self-edges, invalid
   * types, duplicate edges, cycles, stale `CONFLICTS_WITH` against deleted
   * artifacts. Used by quality gates.
   */
  async validateProjectGraph(projectId: string): Promise<GraphValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const edges = await this.depRepo.find({ where: { projectId } });
    const artifactIds = new Set(
      (await this.artifactRepo.find({ where: { projectId }, select: ['id'] })).map((a) => a.id),
    );

    const seen = new Set<string>();
    for (const edge of edges) {
      // Invalid type
      if (!isDependencyType(edge.relation)) {
        errors.push(`UNKNOWN_DEPENDENCY_TYPE: edge ${edge.id} uses '${edge.relation}'`);
      }
      // Self-dependency
      if (edge.sourceArtifactId === edge.targetArtifactId) {
        errors.push(`SELF_DEPENDENCY: edge ${edge.id} points at itself`);
      }
      // Missing endpoint
      if (!artifactIds.has(edge.sourceArtifactId)) {
        errors.push(`MISSING_ENDPOINT: edge ${edge.id} source artifact not found`);
      }
      if (!artifactIds.has(edge.targetArtifactId)) {
        errors.push(`MISSING_ENDPOINT: edge ${edge.id} target artifact not found`);
      }
      // Duplicate (unique key should prevent this, but defensive)
      const key = `${edge.sourceArtifactId}|${edge.targetArtifactId}|${edge.relation}`;
      if (seen.has(key)) {
        warnings.push(`DUPLICATE_DEPENDENCY: ${key}`);
      }
      seen.add(key);
      // Stale CONFLICTS_WITH with low confidence — flag for review.
      if (edge.relation === 'CONFLICTS_WITH' && (edge.confidence ?? 100) < 0.5) {
        warnings.push(`STALE_CONFLICT: edge ${edge.id} has low confidence`);
      }
    }

    // Cycle detection (Kahn layering) over the project graph
    const ids = [...artifactIds];
    const cycleDetected = detectCycle(edges, ids);
    if (cycleDetected) errors.push(`CYCLE: dependency cycle detected in project ${projectId}`);

    return { ok: errors.length === 0, errors, warnings };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private assertValidInput(input: CreateDependencyInput): void {
    if (!isDependencyType(input.dependencyType)) {
      throw new BadRequestException(`Unknown dependency type '${input.dependencyType}'`);
    }
    if (input.sourceArtifactId === input.targetArtifactId) {
      throw new BadRequestException('SELF_DEPENDENCY: source and target must differ');
    }
    if (input.confidence !== undefined && (input.confidence < 0 || input.confidence > 1)) {
      throw new BadRequestException('confidence must be between 0 and 1');
    }
  }

  private async assertArtifactsExist(
    projectId: string,
    sourceArtifactId: string,
    targetArtifactId: string,
  ): Promise<void> {
    const ids = [sourceArtifactId, targetArtifactId];
    const found = await this.artifactRepo.find({
      where: ids.map((id) => ({ id })),
    });
    const foundIds = new Set(found.map((a) => a.id));
    for (const id of ids) {
      if (!foundIds.has(id)) {
        throw new NotFoundException(`Artifact '${id}' not found`);
      }
    }
    // Both endpoints must belong to the same project.
    const mismatched = found.find((a) => a.projectId !== projectId);
    if (mismatched) {
      throw new BadRequestException(
        `Artifact '${mismatched.id}' does not belong to project '${projectId}'`,
      );
    }
  }

  private async getProjectIdForArtifact(artifactId: string): Promise<string> {
    const artifact = await this.artifactRepo.findOne({ where: { id: artifactId } });
    if (!artifact) throw new NotFoundException(`Artifact '${artifactId}' not found`);
    return artifact.projectId;
  }

  private async assertNoCycle(sourceArtifactId: string, targetArtifactId: string): Promise<void> {
    const edges = await this.depRepo.find();
    if (
      wouldCreateCycle(
        edges as unknown as Parameters<typeof wouldCreateCycle>[0],
        sourceArtifactId,
        targetArtifactId,
      )
    ) {
      throw new BadRequestException(
        `CYCLE: dependency ${sourceArtifactId} -> ${targetArtifactId} would create a cycle`,
      );
    }
  }

  private async assertNoDuplicate(
    projectId: string,
    sourceArtifactId: string,
    targetArtifactId: string,
    dependencyType: DependencyType,
  ): Promise<void> {
    const existing = await this.depRepo.findOne({
      where: { projectId, sourceArtifactId, targetArtifactId, relation: dependencyType },
    });
    if (existing) {
      throw new BadRequestException(
        `DUPLICATE_DEPENDENCY: ${dependencyType} edge already exists`,
      );
    }
  }

  private filter(edges: ArtifactDependency[], options: TraversalOptions): ArtifactDependency[] {
    if (!options.dependencyTypes && !options.strictOnly) return edges;
    let out = edges;
    if (options.dependencyTypes && options.dependencyTypes.length > 0) {
      const allow = new Set(options.dependencyTypes);
      out = out.filter((e) => allow.has(e.relation as DependencyType));
    }
    if (options.strictOnly) {
      out = out.filter((e) => e.relation !== 'CONFLICTS_WITH' && e.relation !== 'RELATED_TO');
    }
    return out;
  }

  private async edges(): Promise<ArtifactDependency[]> {
    return this.depRepo.find();
  }
}

export function toDependencyRecord(edge: ArtifactDependency): DependencyRecord {
  return {
    id: edge.id,
    projectId: edge.projectId,
    sourceArtifactId: edge.sourceArtifactId,
    targetArtifactId: edge.targetArtifactId,
    dependencyType: edge.relation as DependencyType,
    weight: edge.weight,
    confidence: edge.confidence,
    sourceReference: edge.sourceReference,
    createdBy: edge.createdBy,
    metadata: edge.metadata ? safeParse(edge.metadata) : null,
    createdAt: edge.createdAt.toISOString(),
  };
}

function safeParse(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Independent cycle check so it can be called without the class.
 * Returns true when the graph has at least one cycle.
 */
export function detectCycle(edges: ArtifactDependency[], allIds: string[]): boolean {
  // Reuse the layering algorithm from artifact-graph.ts.
  const adjacency = buildAdjacency(
    edges as unknown as Parameters<typeof buildAdjacency>[0],
  );
  const indegree = new Map<string, number>();
  for (const id of allIds) indegree.set(id, 0);
  for (const edge of edges) {
    indegree.set(edge.targetArtifactId, (indegree.get(edge.targetArtifactId) ?? 0) + 1);
  }
  const remaining = new Set(allIds);
  while (remaining.size > 0) {
    const ready = [...remaining].filter((id) => (indegree.get(id) ?? 0) === 0);
    if (ready.length === 0) return true;
    for (const id of ready) {
      remaining.delete(id);
      for (const edgeId of adjacency.outgoing.get(id) ?? []) {
        const edge = edges.find((e) => e.id === edgeId);
        if (edge) {
          indegree.set(
            edge.targetArtifactId,
            (indegree.get(edge.targetArtifactId) ?? 0) - 1,
          );
        }
      }
    }
  }
  return false;
}
