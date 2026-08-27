/**
 * Centralized Quality Gate Engine types (Phase 8).
 */

export type QualityStatus = 'PASS' | 'WARNING' | 'REVIEW_REQUIRED' | 'BLOCKED';

export type QualitySeverity = 'info' | 'warning' | 'critical';

export interface QualityIssue {
  check: string;
  severity: QualitySeverity;
  message: string;
  /** Artifact id or externalId the issue refers to. */
  artifactKey?: string;
}

export interface QualityCheckResult {
  key: string;
  status: QualityStatus;
  score: number;
  weight: number;
  issues: QualityIssue[];
}

export interface QualityResult {
  status: QualityStatus;
  /** Weighted 0-100 aggregate score. */
  score: number;
  checks: QualityCheckResult[];
  issues: QualityIssue[];
  warnings: string[];
  blockingIssues: string[];
  recommendations: string[];
  evaluatedAt: string;
  evaluatorVersion: string;
}

/** Normalized artifact shape the engine evaluates (canonical or legacy). */
export interface EvaluatedArtifact {
  id: string;
  kind: string;
  title: string;
  summary?: string | null;
  body?: Record<string, unknown> | null;
  confidence?: number | null;
  provenance?: {
    epistemicClass?: string;
    sources?: Array<{ category: string; refId?: string; label?: string; excerpt?: string }>;
  } | null;
  status?: string | null;
  relatedIds?: string[];
}

export interface ProjectEvaluationResult {
  projectId: string;
  results: Array<{ artifact: EvaluatedArtifact; result: QualityResult }>;
  coverage: QualityCheckResult;
  summary: {
    total: number;
    passed: number;
    warnings: number;
    reviewRequired: number;
    blocked: number;
    averageScore: number;
  };
}
