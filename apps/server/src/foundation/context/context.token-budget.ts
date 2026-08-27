/**
 * Per-task hard token budgets (Phase 3).
 *
 * Configurable from env via `CONTEXT_BUDGET_<TASK>` (e.g.
 * `CONTEXT_BUDGET_REQUIREMENTS=16000`). Defaults match the spec.
 */
import type { ContextTaskType } from './context.types';

export const DEFAULT_CONTEXT_BUDGETS: Readonly<Record<ContextTaskType, number>> = {
  requirements: 12000,
  ux: 8000,
  database: 10000,
  security: 8000,
  architecture: 12000,
  estimation: 6000,
  testing: 8000,
  document: 16000,
  research: 6000,
  compilation: 24000,
  gap_analysis: 12000,
  discovery: 4000,
  validation: 8000,
};

export const CONTEXT_BUDGET_ENV_PREFIX = 'CONTEXT_BUDGET_';

export function loadBudgets(env?: Record<string, string | undefined>): Record<ContextTaskType, number> {
  const out: Record<string, number> = { ...DEFAULT_CONTEXT_BUDGETS };
  if (!env) return out as Record<ContextTaskType, number>;
  for (const key of Object.keys(DEFAULT_CONTEXT_BUDGETS)) {
    const envKey = `${CONTEXT_BUDGET_ENV_PREFIX}${key.toUpperCase()}`;
    const raw = env[envKey];
    if (!raw) continue;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      out[key] = parsed;
    }
  }
  return out as Record<ContextTaskType, number>;
}

/** Conservative token estimate: ~4 chars per token, padded by 10%. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil((text.length / 4) * 1.1);
}

/** Truncate text to fit a token budget; emits a marker when truncated. */
export function truncateToTokens(text: string, maxTokens: number): { text: string; truncated: boolean } {
  const cap = Math.max(1, Math.floor(maxTokens / 1.1) * 4);
  if (text.length <= cap) return { text, truncated: false };
  return { text: `${text.slice(0, Math.max(0, cap - 20)).trimEnd()}…[truncated]`, truncated: true };
}
