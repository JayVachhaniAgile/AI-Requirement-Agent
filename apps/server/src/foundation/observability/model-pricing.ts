/**
 * Pure model pricing table for token-cost tracking (new architecture).
 *
 * Rates are USD per 1M tokens. Unknown models fall back to a conservative
 * default so `estimatedCostUsd` is always defined.
 */

export interface ModelRate {
  inputPer1M: number;
  outputPer1M: number;
}

export const MODEL_PRICING: Record<string, ModelRate> = {
  'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 },
  'gpt-4.1': { inputPer1M: 2, outputPer1M: 8 },
  'gpt-4.1-mini': { inputPer1M: 0.4, outputPer1M: 1.6 },
  'llama-3.3-70b-versatile': { inputPer1M: 0.59, outputPer1M: 0.79 },
  'llama-3.1-8b': { inputPer1M: 0.05, outputPer1M: 0.08 },
  'llama3': { inputPer1M: 0.05, outputPer1M: 0.08 },
  'claude-3-5-sonnet': { inputPer1M: 3, outputPer1M: 15 },
  'claude-3-7-sonnet': { inputPer1M: 3, outputPer1M: 15 },
};

/** Conservative default for models without a published rate in this table. */
const DEFAULT_RATE: ModelRate = { inputPer1M: 2.5, outputPer1M: 10 };

function normalizeModel(model: string): string {
  return model.trim().toLowerCase();
}

export function getModelRate(model: string): ModelRate {
  const normalized = normalizeModel(model);
  const exact = MODEL_PRICING[normalized];
  if (exact) return exact;
  // Prefix match: `gpt-4o-2024-08-06` -> `gpt-4o`, `claude-3-5-sonnet-...` -> sonnet.
  const prefixes = Object.keys(MODEL_PRICING).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) return MODEL_PRICING[prefix];
  }
  return DEFAULT_RATE;
}

export interface CostEstimate {
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  rate: ModelRate;
}

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): CostEstimate {
  const rate = getModelRate(model);
  const inputCostUsd = (inputTokens / 1_000_000) * rate.inputPer1M;
  const outputCostUsd = (outputTokens / 1_000_000) * rate.outputPer1M;
  return {
    inputCostUsd,
    outputCostUsd,
    totalCostUsd: inputCostUsd + outputCostUsd,
    rate,
  };
}
