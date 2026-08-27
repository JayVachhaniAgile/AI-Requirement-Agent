/**
 * Quality evaluation (Phase 8) — aggregate checks into a QualityResult.
 *
 * Pipeline: LLM output → schema → normalization → business → provenance →
 * consistency → dependency → quality evaluation → quality gate →
 * PASS/WARNING/REVIEW_REQUIRED/BLOCKED → persistence (service layer).
 */
import { ALL_QUALITY_CHECKS, type CheckContext } from './quality.checks';
import { detectConflicts, type ConflictFinding } from './quality.conflicts';
import { resolveCheckWeights, resolveThreshold, statusRank } from './quality.thresholds';
import type {
  EvaluatedArtifact,
  ProjectEvaluationResult,
  QualityCheckResult,
  QualityIssue,
  QualityResult,
  QualityStatus,
} from './quality.types';

export const QUALITY_EVALUATOR_VERSION = '8.0.0';

export interface EvaluateOptions {
  env?: Record<string, string | undefined>;
  conflictEdges?: Array<{ sourceArtifactKey: string; targetArtifactKey: string; reason?: string | null }>;
  checks?: string[];
}

export interface EvaluationInput {
  artifact: EvaluatedArtifact;
  allArtifacts: EvaluatedArtifact[];
  options?: EvaluateOptions;
}

/** Full evaluation pipeline for one artifact. */
export function evaluateArtifact(input: EvaluationInput): QualityResult {
  const { artifact, allArtifacts, options } = input;
  const env = options?.env;
  const threshold = resolveThreshold(artifact.kind, env);
  const weights = resolveCheckWeights(env);
  const conflicts: ConflictFinding[] = detectConflicts(allArtifacts, options?.conflictEdges);

  const ctx: CheckContext = {
    artifact,
    allArtifacts,
    conflicts,
    threshold,
    env,
  };

  // `coverage` is a project-level check — excluded from single-artifact runs.
  const checkKeys =
    options?.checks ?? Object.keys(ALL_QUALITY_CHECKS).filter((key) => key !== 'coverage');
  const results: QualityCheckResult[] = checkKeys
    .filter((key) => ALL_QUALITY_CHECKS[key])
    .map((key) => {
      const result = ALL_QUALITY_CHECKS[key](ctx);
      return { ...result, weight: weights[key] ?? 0 };
    });

  const issues: QualityIssue[] = results.flatMap((r) => r.issues);
  const blockingIssues = issues.filter((i) => i.severity === 'critical').map((i) => i.message);
  const warnings = issues.filter((i) => i.severity === 'warning').map((i) => i.message);

  const totalWeight = results.reduce((sum, r) => sum + r.weight, 0);
  const score =
    totalWeight > 0
      ? Math.round(
          results.reduce((sum, r) => sum + r.score * r.weight, 0) / totalWeight,
        )
      : Math.round(results.reduce((sum, r) => sum + r.score, 0) / Math.max(1, results.length));

  const status = deriveStatus(results, blockingIssues, threshold, score);
  const recommendations = buildRecommendations(results, threshold);

  return {
    status,
    score,
    checks: results,
    issues,
    warnings,
    blockingIssues,
    recommendations,
    evaluatedAt: new Date().toISOString(),
    evaluatorVersion: QUALITY_EVALUATOR_VERSION,
  };
}

/** Project-level evaluation: run the engine over every artifact + coverage. */
export function evaluateProject(projectId: string, artifacts: EvaluatedArtifact[], options?: EvaluateOptions): ProjectEvaluationResult {
  const results = artifacts.map((artifact) => ({
    artifact,
    result: evaluateArtifact({ artifact, allArtifacts: artifacts, options }),
  }));
  const summary = {
    total: results.length,
    passed: results.filter((r) => r.result.status === 'PASS').length,
    warnings: results.filter((r) => r.result.status === 'WARNING').length,
    reviewRequired: results.filter((r) => r.result.status === 'REVIEW_REQUIRED').length,
    blocked: results.filter((r) => r.result.status === 'BLOCKED').length,
    averageScore: results.length > 0 ? Math.round(results.reduce((s, r) => s + r.result.score, 0) / results.length) : 0,
  };
  const kindsPresent = new Set(artifacts.map((a) => a.kind));
  const required = ['requirement', 'user_story', 'test_case', 'entity', 'api'];
  const missing = required.filter((k) => !kindsPresent.has(k));
  const coverage: QualityCheckResult = {
    key: 'coverage',
    status: missing.length === 0 ? 'PASS' : missing.length <= 2 ? 'WARNING' : 'REVIEW_REQUIRED',
    score: Math.round(((required.length - missing.length) / required.length) * 100),
    weight: 0,
    issues: missing.map((kind) => ({ check: 'coverage', severity: 'info' as const, message: `no artifacts of kind '${kind}' in project` })),
  };
  return { projectId, results, coverage, summary };
}

function deriveStatus(
  results: QualityCheckResult[],
  blockingIssues: string[],
  threshold: number,
  score: number,
): QualityStatus {
  if (blockingIssues.length > 0) return 'BLOCKED';
  const worst = results
    .map((r) => r.status)
    .sort((a, b) => statusRank(b) - statusRank(a))[0];
  if (score < threshold - 10 || worst === 'REVIEW_REQUIRED') return 'REVIEW_REQUIRED';
  if (score < threshold || worst === 'WARNING') return 'WARNING';
  return 'PASS';
}

function buildRecommendations(results: QualityCheckResult[], threshold: number): string[] {
  const recommendations: string[] = [];
  for (const result of results) {
    if (result.status === 'BLOCKED') {
      recommendations.push(`fix ${result.key}: ${result.issues.map((i) => i.message).join('; ')}`);
    } else if (result.status === 'REVIEW_REQUIRED' || result.status === 'WARNING') {
      recommendations.push(`review ${result.key} before trusting this artifact`);
    }
    if (result.score < threshold) {
      recommendations.push(`raise ${result.key} score above ${threshold}`);
    }
  }
  return recommendations.slice(0, 5);
}
