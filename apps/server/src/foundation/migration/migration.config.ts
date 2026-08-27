/**
 * Migration controls (Phase 6) — feature flags + thresholds + batches.
 *
 * Every migratable agent has a mode: `legacy` | `shadow` | `new`.
 * Resolution order:
 *   1. `MIGRATION_MODE=<mode>` global env override
 *   2. `MIGRATION_MODE_<AGENT_KEY_UPPER_SNAKE>=<mode>` per-agent env override
 *   3. default: `legacy`
 *
 * Nothing is hardcoded — all migration behavior is driven by configuration.
 */

export type MigrationMode = 'legacy' | 'shadow' | 'new';

export const MIGRATABLE_AGENTS = [
  'discovery',
  'research',
  'business-analysis',
  'product-analysis',
  'requirements-engineering',
  'ux-design',
  'data-architecture',
  'ai-architecture',
  'solution-architecture',
  'security-review',
  'qa-planning',
  'estimation',
  'validation',
  'debate',
  'gap-analysis',
] as const;

export type MigratableAgentKey = (typeof MIGRATABLE_AGENTS)[number];

export const MIGRATION_BATCHES: Record<number, readonly string[]> = {
  1: ['discovery', 'research', 'business-analysis', 'product-analysis'],
  2: ['requirements-engineering', 'ux-design', 'data-architecture', 'ai-architecture'],
  3: ['solution-architecture', 'security-review', 'qa-planning', 'estimation'],
  4: ['validation', 'debate', 'gap-analysis'],
};

export interface MigrationThresholds {
  /** Minimum skill quality score (0-100) to replace a legacy agent. */
  minQualityScore: number;
  /** Maximum estimated cost (USD) per skill execution. */
  maxCostUsd: number;
  /** Maximum skill latency (ms). */
  maxLatencyMs: number;
  /** Minimum artifacts a skill must produce. */
  minArtifactCount: number;
  /** Minimum coverage ratio (0-1) of legacy items reproduced by the skill. */
  minCoverage: number;
  /** When true, critical contradictions still block migration. */
  blockOnCriticalRegression: boolean;
}

export const DEFAULT_MIGRATION_THRESHOLDS: MigrationThresholds = {
  minQualityScore: 70,
  maxCostUsd: 5,
  maxLatencyMs: 120000,
  minArtifactCount: 1,
  minCoverage: 0.7,
  blockOnCriticalRegression: true,
};

export function isMigratableAgent(agentKey: string): agentKey is MigratableAgentKey {
  return (MIGRATABLE_AGENTS as readonly string[]).includes(agentKey);
}

export function envKeyForAgent(agentKey: string): string {
  return `MIGRATION_MODE_${agentKey.toUpperCase().replace(/-/g, '_')}`;
}

export function resolveMigrationMode(agentKey: string, env: Record<string, string | undefined>): MigrationMode {
  const global = env.MIGRATION_MODE;
  if (global === 'legacy' || global === 'shadow' || global === 'new') return global;
  const per = env[envKeyForAgent(agentKey)];
  if (per === 'legacy' || per === 'shadow' || per === 'new') return per;
  return 'legacy';
}

export function resolveThresholds(env: Record<string, string | undefined>): MigrationThresholds {
  const num = (key: string, fallback: number): number => {
    const raw = env[key];
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };
  return {
    minQualityScore: num('MIGRATION_MIN_QUALITY_SCORE', DEFAULT_MIGRATION_THRESHOLDS.minQualityScore),
    maxCostUsd: num('MIGRATION_MAX_COST_USD', DEFAULT_MIGRATION_THRESHOLDS.maxCostUsd),
    maxLatencyMs: num('MIGRATION_MAX_LATENCY_MS', DEFAULT_MIGRATION_THRESHOLDS.maxLatencyMs),
    minArtifactCount: num('MIGRATION_MIN_ARTIFACT_COUNT', DEFAULT_MIGRATION_THRESHOLDS.minArtifactCount),
    minCoverage: num('MIGRATION_MIN_COVERAGE', DEFAULT_MIGRATION_THRESHOLDS.minCoverage),
    blockOnCriticalRegression:
      env.MIGRATION_BLOCK_ON_CRITICAL === 'false'
        ? false
        : DEFAULT_MIGRATION_THRESHOLDS.blockOnCriticalRegression,
  };
}

export function batchForAgent(agentKey: string): number | null {
  for (const [batch, keys] of Object.entries(MIGRATION_BATCHES)) {
    if ((keys as readonly string[]).includes(agentKey)) return Number(batch);
  }
  return null;
}
