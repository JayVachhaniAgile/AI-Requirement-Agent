/**
 * Pure comparison engine (Phase 6) — legacy vs skill output.
 *
 * Computes the metrics table and evaluates the Phase 6 migration rule:
 *   schema validation passes AND quality threshold passes AND
 *   no critical regression AND required artifacts generated AND
 *   cost/latency acceptable.
 */
import type {
  AgentOutputSummary,
  ComparisonMetrics,
  MigrationVerdict,
} from './migration.types';
import type { MigrationThresholds } from './migration.config';

export function computeComparison(
  legacy: AgentOutputSummary,
  skill: AgentOutputSummary,
): ComparisonMetrics {
  const legacyKeys = new Set(legacy.itemKeys);
  const skillKeys = new Set(skill.itemKeys);

  let coverage = 0;
  if (legacyKeys.size > 0) {
    let overlap = 0;
    for (const key of legacyKeys) {
      if (skillKeys.has(key)) overlap += 1;
    }
    coverage = overlap / legacyKeys.size;
  } else if (skillKeys.size > 0) {
    coverage = 1; // nothing to reproduce — skill adds value without losing legacy items
  }

  let contradictions = 0;
  for (const key of legacyKeys) {
    if (skillKeys.has(key)) {
      // confidence conflict: skill claims much higher/lower than legacy
      const legacyConf = legacy.confidence;
      const skillConf = skill.confidence;
      if (Math.abs(skillConf - legacyConf) > 20) contradictions += 1;
    }
  }

  const completeness =
    legacy.artifactCount > 0
      ? Math.min(1, skill.artifactCount / legacy.artifactCount)
      : skill.artifactCount > 0
        ? 1
        : 0;

  return {
    completeness,
    coverage: clamp01(coverage),
    missingInformation: clamp01(1 - coverage),
    contradictions,
    confidenceDelta: round2(skill.confidence - legacy.confidence),
    artifactCountDelta: skill.artifactCount - legacy.artifactCount,
    qualityScoreDelta:
      skill.qualityScore != null && legacy.qualityScore != null
        ? round2(skill.qualityScore - legacy.qualityScore)
        : null,
    tokenDelta: skill.tokens - legacy.tokens,
    latencyDelta: skill.latencyMs - legacy.latencyMs,
    costDelta: round2(skill.costUsd - legacy.costUsd),
    validationFailuresDelta: skill.validationFailures - legacy.validationFailures,
  };
}

export function evaluateMigrationRule(
  legacy: AgentOutputSummary,
  skill: AgentOutputSummary,
  metrics: ComparisonMetrics,
  thresholds: MigrationThresholds,
): MigrationVerdict {
  const checks = {
    schemaPasses: skill.validationFailures === 0,
    qualityPasses: (skill.qualityScore ?? 0) >= thresholds.minQualityScore,
    noCriticalRegression:
      !thresholds.blockOnCriticalRegression ||
      (metrics.contradictions === 0 && metrics.missingInformation < 1 - thresholds.minCoverage),
    requiredArtifacts: skill.artifactCount >= thresholds.minArtifactCount,
    costLatencyAcceptable:
      skill.costUsd <= thresholds.maxCostUsd && skill.latencyMs <= thresholds.maxLatencyMs,
  };

  const blockers: string[] = [];
  if (!checks.schemaPasses) blockers.push('schema validation failed');
  if (!checks.qualityPasses) blockers.push('quality score below threshold');
  if (!checks.noCriticalRegression) blockers.push('critical regression detected');
  if (!checks.requiredArtifacts) blockers.push('required artifacts not generated');
  if (!checks.costLatencyAcceptable) blockers.push('cost/latency above acceptable bounds');

  return { canMigrate: blockers.length === 0, checks, blockers };
}

/** Build the summary for a legacy AgentResult / skill run. */
export function summarizeLegacyOutput(input: {
  itemKeys: string[];
  confidence?: number;
  tokens?: number;
  latencyMs?: number;
  costUsd?: number;
  qualityScore?: number | null;
  validationFailures?: number;
  contentLength?: number;
}): AgentOutputSummary {
  return {
    artifactCount: input.itemKeys.length,
    confidence: input.confidence ?? 0,
    tokens: input.tokens ?? 0,
    latencyMs: input.latencyMs ?? 0,
    costUsd: input.costUsd ?? 0,
    qualityScore: input.qualityScore ?? null,
    validationFailures: input.validationFailures ?? 0,
    itemKeys: input.itemKeys,
    contentLength: input.contentLength ?? 0,
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
