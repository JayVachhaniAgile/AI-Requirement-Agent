/**
 * Pluggable resolver that turns an artifact into its dependency neighborhood.
 *
 * The Context Engine takes a `DependencyResolver` at construction so unit
 * tests can inject fakes without spinning up TypeORM. The default resolver
 * reads from the same relational tables used by Phase 4's
 * ArtifactDependencyService.
 */
import type { ArtifactDependency } from '../../database/entities';

export interface DependencyNeighbor {
  artifactId: string;
  artifactType: string;
  artifactTitle: string | null;
  relation: string;
  depth: number;
  confidence: number | null;
  weight: number;
  pathIds: string[];
}

export interface ResolveOptions {
  direction: 'upstream' | 'downstream' | 'both';
  maxDepth: number;
  dependencyTypes?: string[];
  strictOnly?: boolean;
}

export interface DependencyResolver {
  /** Resolve every artifact reachable from `startIds` within budget. */
  resolve(
    projectId: string,
    startIds: string[],
    options: ResolveOptions,
  ): Promise<DependencyNeighbor[]>;
}

/**
 * TypeORM-backed resolver. Lazy-loads Artifact + ArtifactDependency so the
 * import graph stays light; usable from any module that already has TypeORM
 * wired in.
 */
export class TypeOrmDependencyResolver implements DependencyResolver {
  constructor(
    private readonly depRepo: { find: (opts: any) => Promise<ArtifactDependency[]> },
    private readonly artifactRepo: { find: (opts: any) => Promise<Array<{ id: string; type: string; title: string | null }>> },
  ) {}

  async resolve(
    projectId: string,
    startIds: string[],
    options: ResolveOptions,
  ): Promise<DependencyNeighbor[]> {
    if (startIds.length === 0) return [];
    const edges = await this.depRepo.find({ where: { projectId } });
    const types = options.dependencyTypes && options.dependencyTypes.length > 0
      ? new Set(options.dependencyTypes)
      : null;
    const allowed = (rel: string) =>
      (types?.has(rel) ?? true) && (!options.strictOnly || (rel !== 'CONFLICTS_WITH' && rel !== 'RELATED_TO'));

    const neighbors: DependencyNeighbor[] = [];
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number; pathIds: string[] }> = startIds.map((id) => ({
      id,
      depth: 0,
      pathIds: [id],
    }));
    const startSet = new Set(startIds);
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      if (current.depth >= options.maxDepth) continue;
      const next = edges.filter((e) => {
        if (!allowed(e.relation)) return false;
        if (options.direction === 'downstream' || options.direction === 'both') {
          if (e.sourceArtifactId === current.id && !startSet.has(e.targetArtifactId)) {
            if (visited.has(e.targetArtifactId)) return false;
            neighbors.push({
              artifactId: e.targetArtifactId,
              artifactType: '',
              artifactTitle: null,
              relation: e.relation,
              depth: current.depth + 1,
              confidence: e.confidence,
              weight: e.weight,
              pathIds: [...current.pathIds, e.targetArtifactId],
            });
            visited.add(e.targetArtifactId);
            queue.push({ id: e.targetArtifactId, depth: current.depth + 1, pathIds: [...current.pathIds, e.targetArtifactId] });
          }
        }
        if (options.direction === 'upstream' || options.direction === 'both') {
          if (e.targetArtifactId === current.id && !startSet.has(e.sourceArtifactId)) {
            if (visited.has(e.sourceArtifactId)) return false;
            neighbors.push({
              artifactId: e.sourceArtifactId,
              artifactType: '',
              artifactTitle: null,
              relation: e.relation,
              depth: current.depth + 1,
              confidence: e.confidence,
              weight: e.weight,
              pathIds: [e.sourceArtifactId, ...current.pathIds],
            });
            visited.add(e.sourceArtifactId);
            queue.push({ id: e.sourceArtifactId, depth: current.depth + 1, pathIds: [e.sourceArtifactId, ...current.pathIds] });
          }
        }
        return false;
      });
      void next;
    }

    if (neighbors.length === 0) return neighbors;
    const artifactIds = [...new Set(neighbors.map((n) => n.artifactId))];
    const artifacts = await this.artifactRepo.find({
      where: artifactIds.map((id) => ({ id })),
    });
    const byId = new Map(artifacts.map((a) => [a.id, a]));
    return neighbors.map((n) => {
      const a = byId.get(n.artifactId);
      return { ...n, artifactType: a?.type ?? 'UNKNOWN', artifactTitle: a?.title ?? null };
    });
  }
}
