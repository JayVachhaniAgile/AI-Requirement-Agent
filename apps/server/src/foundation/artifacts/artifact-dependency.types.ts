/**
 * Strongly typed dependency taxonomy (Phase 4).
 *
 * Reuses the existing `artifact_dependencies.relation` column; values are
 * free-form strings today, so the public API accepts the literal union.
 */
export const DEPENDENCY_TYPES = [
  'DERIVED_FROM',
  'DEPENDS_ON',
  'IMPLEMENTS',
  'REFINES',
  'CONFLICTS_WITH',
  'VALIDATES',
  'SATISFIES',
  'GENERATED_FROM',
  'SUPERSEDES',
  'RELATED_TO',
] as const;

export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

export function isDependencyType(value: string): value is DependencyType {
  return (DEPENDENCY_TYPES as readonly string[]).includes(value);
}

export const IMPACT_LEVELS = ['DIRECT', 'INDIRECT', 'POTENTIAL', 'NO_IMPACT'] as const;
export type ImpactLevel = (typeof IMPACT_LEVELS)[number];

export interface DependencyEvidence {
  /** When true the dependency was auto-generated and may be stale. */
  generated?: boolean;
  /** Producer skill/agent key. */
  producer?: string;
  /** Free-form pointer (doc id, agent execution id). */
  sourceRef?: string;
}

export interface DependencyRecord {
  id: string;
  projectId: string;
  sourceArtifactId: string;
  targetArtifactId: string;
  dependencyType: DependencyType;
  weight: number;
  confidence: number | null;
  sourceReference: string | null;
  createdBy: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface TraversalOptions {
  dependencyTypes?: DependencyType[];
  maxDepth?: number;
  /** When true, exclude POTENTIAL (CONFLICTS_WITH, RELATED_TO) from results. */
  strictOnly?: boolean;
}

export interface DependencyGraph {
  projectId: string;
  edges: DependencyRecord[];
  artifacts: Array<{ id: string; type: string; title: string | null }>;
  /** Per-artifact downstream count (for UI sizing). */
  degree: Record<string, { in: number; out: number }>;
}

export interface DependencyPath {
  artifactId: string;
  /** Ordered list of edges, source -> ... -> target. */
  edges: DependencyRecord[];
  /** Total depth (number of hops). */
  depth: number;
}

export interface ImpactAffected {
  artifactId: string;
  artifactType: string;
  title: string | null;
  /** Path of edges from the source artifact to this one. */
  path: DependencyPath;
  impactLevel: ImpactLevel;
}

export interface ImpactReport {
  artifactId: string;
  projectId: string;
  levels: Record<ImpactLevel, ImpactAffected[]>;
  /** Compact dependency paths for the UI. */
  paths: DependencyPath[];
  /** True when the graph had cycles or stale edges relevant to this report. */
  warnings: string[];
}
