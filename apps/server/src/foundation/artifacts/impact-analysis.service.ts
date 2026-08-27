import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Artifact,
  ArtifactDependency,
} from '../../database/entities';
import {
  IMPACT_LEVELS,
  isDependencyType,
  type ImpactAffected,
  type ImpactLevel,
  type ImpactReport,
  type DependencyRecord,
  type DependencyPath,
  type DependencyType,
} from './artifact-dependency.types';
import { toDependencyRecord } from './artifact-dependency.service';

/**
 * ImpactAnalysisService (Phase 4) — answers "if this artifact changes,
 * what may be affected?" without invoking any AI skill.
 *
 * Levels:
 *   DIRECT      — single-hop dependent, hard/structural dependency
 *   INDIRECT    — multi-hop dependent via DERIVES/IMPLEMENTS/SATISFIES chains
 *   POTENTIAL   — multi-hop dependent via soft edges (CONFLICTS_WITH / RELATED_TO)
 *   NO_IMPACT   — fallback when nothing reachable
 *
 * The analyzer returns enriched artifacts (type, title, dependency paths)
 * so the UI / Context Engine can present concrete evidence.
 */
@Injectable()
export class ImpactAnalysisService {
  private readonly logger = new Logger(ImpactAnalysisService.name);

  constructor(
    @InjectRepository(ArtifactDependency)
    private readonly depRepo: Repository<ArtifactDependency>,
    @InjectRepository(Artifact)
    private readonly artifactRepo: Repository<Artifact>,
  ) {}

  async analyze(
    projectId: string,
    artifactId: string,
    options: { maxDepth?: number } = {},
  ): Promise<ImpactReport> {
    const maxDepth = options.maxDepth ?? 8;
    const edges = await this.depRepo.find({ where: { projectId } });
    const artifacts = await this.artifactRepo.find({ where: { projectId } });
    const artifactById = new Map(artifacts.map((a) => [a.id, a]));
    const target = artifactById.get(artifactId);

    const warnings: string[] = [];
    if (!target) {
      warnings.push(`ARTIFACT_NOT_FOUND: artifact '${artifactId}' is not in project '${projectId}'`);
      return emptyReport(projectId, artifactId, warnings);
    }

    const out: Record<ImpactLevel, ImpactAffected[]> = {
      DIRECT: [],
      INDIRECT: [],
      POTENTIAL: [],
      NO_IMPACT: [],
    };
    const seen = new Set<string>();
    const pathsByArtifact = new Map<string, DependencyPath[]>();

    // BFS over incoming edges (dependents = artifacts that point at `artifactId`).
    const queue: Array<{ id: string; depth: number; path: DependencyRecord[] }> = [
      { id: artifactId, depth: 0, path: [] },
    ];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      if (current.depth >= maxDepth) continue;
      const incoming = edges.filter((e) => e.targetArtifactId === current.id);
      for (const edge of incoming) {
        const dep = toDependencyRecord(edge);
        const extendedPath = [...current.path, dep];
        const level = classify(edge.relation, current.depth + 1);
        if (!seen.has(edge.sourceArtifactId)) {
          seen.add(edge.sourceArtifactId);
          const aff = artifactById.get(edge.sourceArtifactId);
          out[level].push({
            artifactId: edge.sourceArtifactId,
            artifactType: aff?.type ?? 'UNKNOWN',
            title: aff?.title ?? null,
            path: { artifactId, edges: extendedPath, depth: extendedPath.length },
            impactLevel: level,
          });
          const list = pathsByArtifact.get(edge.sourceArtifactId) ?? [];
          list.push({ artifactId, edges: extendedPath, depth: extendedPath.length });
          pathsByArtifact.set(edge.sourceArtifactId, list);
          queue.push({
            id: edge.sourceArtifactId,
            depth: current.depth + 1,
            path: extendedPath,
          });
        }
      }
    }

    if (out.DIRECT.length === 0 && out.INDIRECT.length === 0 && out.POTENTIAL.length === 0) {
      out.NO_IMPACT.push({
        artifactId: artifactId,
        artifactType: target.type,
        title: target.title,
        path: { artifactId, edges: [], depth: 0 },
        impactLevel: 'NO_IMPACT',
      });
    }

    // Detect unused / invalid dependency types present in the graph.
    const invalidTypes = edges
      .map((e) => e.relation)
      .filter((t) => !isDependencyType(t as DependencyType));
    if (invalidTypes.length > 0) {
      warnings.push(`INVALID_DEPENDENCY_TYPES: ${[...new Set(invalidTypes)].join(', ')}`);
    }

    return {
      artifactId,
      projectId,
      levels: out,
      paths: [...pathsByArtifact.values()].flat(),
      warnings,
    };
  }
}

function classify(relation: string, depth: number): ImpactLevel {
  if (depth === 1) return 'DIRECT';
  if (relation === 'CONFLICTS_WITH' || relation === 'RELATED_TO') return 'POTENTIAL';
  return 'INDIRECT';
}

function emptyReport(projectId: string, artifactId: string, warnings: string[]): ImpactReport {
  const levels = {
    DIRECT: [],
    INDIRECT: [],
    POTENTIAL: [],
    NO_IMPACT: [],
  } as Record<ImpactLevel, ImpactAffected[]>;
  void IMPACT_LEVELS;
  return {
    projectId,
    artifactId,
    levels,
    paths: [],
    warnings,
  };
}
