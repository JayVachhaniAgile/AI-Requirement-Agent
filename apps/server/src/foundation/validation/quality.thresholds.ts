/**
 * Artifact-specific quality thresholds (Phase 8) — configurable, never
 * hardcoded in business logic.
 *
 * Resolution: `QUALITY_THRESHOLD_<KIND_UPPER_SNAKE>` env override, else the
 * default table, else 80.
 */
import type { QualityStatus } from './quality.types';

export const DEFAULT_QUALITY_THRESHOLDS: Record<string, number> = {
  // Canonical kinds
  requirement: 85,
  non_functional_requirement: 85,
  security_requirement: 90,
  user_story: 85,
  acceptance_criterion: 85,
  architecture_decision: 80,
  api: 85,
  entity: 85,
  relationship: 85,
  screen: 80,
  test_case: 80,
  risk: 80,
  assumption: 70,
  business_rule: 85,
  constraint: 80,
  actor: 75,
  project_goal: 85,
  estimate: 80,
  scope_item: 80,
  // Legacy knowledge types
  FUNCTIONAL_REQUIREMENT: 85,
  NON_FUNCTIONAL_REQUIREMENT: 85,
  SECURITY_REQUIREMENT: 90,
  USER_STORY: 85,
  ACCEPTANCE_CRITERION: 85,
  ARCHITECTURE_DECISION: 80,
  API_SPEC: 85,
  DATA_ENTITY: 85,
  DATA_RELATIONSHIP: 85,
  SCREEN: 80,
  TEST_CASE: 80,
  RISK: 80,
  ASSUMPTION: 70,
  BUSINESS_RULE: 85,
};

export const DEFAULT_QUALITY_THRESHOLD = 80;

export function thresholdEnvKey(kind: string): string {
  return `QUALITY_THRESHOLD_${kind.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}

export function resolveThreshold(kind: string, env?: Record<string, string | undefined>): number {
  const raw = env?.[thresholdEnvKey(kind)];
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) return parsed;
  }
  return DEFAULT_QUALITY_THRESHOLDS[kind] ?? DEFAULT_QUALITY_THRESHOLD;
}

/**
 * Check weights (normalized). Overridable per check via
 * `QUALITY_CHECK_WEIGHT_<KEY_UPPER>`.
 */
export const DEFAULT_CHECK_WEIGHTS: Record<string, number> = {
  schema: 0.15,
  completeness: 0.12,
  consistency: 0.12,
  traceability: 0.1,
  dependency_integrity: 0.1,
  confidence: 0.08,
  testability: 0.08,
  requirement_quality: 0.08,
  source_support: 0.07,
  hallucination_risk: 0.05,
  coverage: 0.05,
};

export const QUALITY_CHECK_KEYS = Object.keys(DEFAULT_CHECK_WEIGHTS);

export function checkWeightEnvKey(key: string): string {
  return `QUALITY_CHECK_WEIGHT_${key.toUpperCase()}`;
}

export function resolveCheckWeights(env?: Record<string, string | undefined>): Record<string, number> {
  const out: Record<string, number> = {};
  let total = 0;
  for (const key of QUALITY_CHECK_KEYS) {
    const raw = env?.[checkWeightEnvKey(key)];
    const parsed = raw ? Number(raw) : NaN;
    out[key] = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_CHECK_WEIGHTS[key];
    total += out[key];
  }
  if (total > 0) {
    for (const key of QUALITY_CHECK_KEYS) out[key] = out[key] / total;
  }
  return out;
}

/** Map a status to its severity ordering for aggregation. */
export function statusRank(status: QualityStatus): number {
  switch (status) {
    case 'PASS':
      return 0;
    case 'WARNING':
      return 1;
    case 'REVIEW_REQUIRED':
      return 2;
    case 'BLOCKED':
      return 3;
  }
}
