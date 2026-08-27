/**
 * Context Engine — request / package types (Phase 3).
 *
 * One project knowledge base → Context Engine → task-specific context → agent.
 * The Context Compiler returns the SMALLEST useful context for each AI task,
 * respecting hard token budgets, dependencies, confidence and recency.
 */

import type { CanonicalKind } from '../canonical/canonical.types';

export type ContextSourceKind = 'canonical' | 'knowledge_item' | 'artifact';

export interface ContextSourceRef {
  projectId?: string;
  sourceKind: ContextSourceKind;
  /** `(projectId, kind, externalId)` for canonical items; legacy ids otherwise. */
  externalId: string;
  kind: CanonicalKind | string;
  /** Producer skill/agent key, when known. */
  producer?: string;
  /** Used to invalidate cache when source versions change. */
  version?: number;
}

export type ContextTaskType =
  | 'requirements'
  | 'ux'
  | 'database'
  | 'security'
  | 'architecture'
  | 'estimation'
  | 'testing'
  | 'document'
  | 'research'
  | 'compilation'
  | 'gap_analysis'
  | 'discovery'
  | 'validation';

export interface ContextRequest {
  projectId: string;
  agentSkill: string;
  taskType: ContextTaskType;
  /** Pinned sources the task explicitly depends on. */
  artifactIds?: string[];
  /** Kinds to include (canonical kind names or legacy knowledge types). */
  artifactTypes?: string[];
  /** Canonical domains to include. */
  domains?: string[];
  /** Outgoing dependency relations to follow (e.g. `depends_on`, `satisfies`). */
  requiredRelationships?: string[];
  /** When true, follow outgoing dependencies (artifacts `artifactId` depends on). */
  includeDirectDependencies?: boolean;
  /** When true, follow incoming dependencies (artifacts depending on `artifactId`). */
  includeDependents?: boolean;
  /** Maximum dependency hops to traverse (default 2). */
  dependencyMaxDepth?: number;
  /** When true, only the strongest relationships survive budget pressure. */
  dependencyStrict?: boolean;
  /** When true, include semantic evidence (long text, research snippets). */
  evidenceRequired?: boolean;
  /** Hard token budget for the final package. */
  maxTokens: number;
  /** Optional recency filter in days — only items updated within this window. */
  recency?: number;
  /** Minimum confidence (0-100) for included items. */
  confidenceThreshold?: number;
}

export interface ContextEvidence {
  source: ContextSourceRef;
  /** Plain-text excerpt or retrieved chunk. */
  text: string;
  /** 0-1 lexical/semantic relevance score. */
  score: number;
}

export interface ContextItem {
  source: ContextSourceRef;
  title: string;
  summary?: string;
  /** Structured body, if any. */
  body?: Record<string, unknown>;
  confidence?: number;
  epistemicClass?: string;
  /** Ordered list of layered concepts this item belongs to. */
  layers?: string[];
  /** Provenance sources — answers "where did this come from?". */
  provenance?: Array<{ category: string; refId?: string; label?: string }>;
  /** Optional dependency ids the consumer should follow. */
  dependencyIds?: string[];
  /** 0-1 relevance score against the request. */
  score: number;
  /** Estimated tokens contributed to the package. */
  tokenEstimate: number;
}

export interface ContextPackage {
  projectId: string;
  agentSkill: string;
  taskType: ContextTaskType;
  /** Short project summary (≤ 800 chars). */
  projectSummary: string;
  relevantArtifacts: ContextItem[];
  relevantEvidence: ContextEvidence[];
  dependencies: ContextItem[];
  decisions: ContextItem[];
  assumptions: ContextItem[];
  openQuestions: ContextItem[];
  tokenEstimate: number;
  sourceReferences: ContextSourceRef[];
  /** When this package was produced (cache key component). */
  generatedAt: string;
  /** True when this package was served from cache. */
  cached: boolean;
  /** Request hash — same request + same source versions → cache hit. */
  cacheKey: string;
  /** Notes about missing or conflicting sources. */
  warnings: string[];
}

/** What the compiler returned on a *miss*; the cache key is the version. */
export interface ContextCompileResult {
  package: ContextPackage;
  /** Set of source (projectId|kind|externalId|version) fingerprints. */
  sourceFingerprint: string;
}
