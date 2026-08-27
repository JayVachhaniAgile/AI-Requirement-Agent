/**
 * P2-2: Config-driven model tiering.
 *
 * Each agent is assigned a capability tier; the actual model per tier is
 * resolved from environment config (`LLM_MODEL_HIGH`, `LLM_MODEL_STANDARD`,
 * `LLM_MODEL_FAST`), falling back to the provider default model. Change the
 * tier mapping here or the env vars — never hardcode models in agents.
 */

export type AgentModelTier = 'high' | 'standard' | 'fast';

export const AGENT_MODEL_TIERS: Record<string, AgentModelTier> = {
  discovery: 'standard',
  research: 'fast',
  'business-analysis': 'standard',
  'product-analysis': 'standard',
  'requirements-engineering': 'high',
  'ux-design': 'standard',
  'data-architecture': 'standard',
  'ai-architecture': 'standard',
  'solution-architecture': 'high',
  'security-review': 'standard',
  'qa-planning': 'standard',
  estimation: 'fast',
  validation: 'high',
  debate: 'high',
  'gap-analysis': 'standard',
  'gap-patch': 'standard',
};

/**
 * Per-agent max_tokens floors (fixed-prompts doc guidance). Requirements
 * Engineer and QA produce the largest payloads; Debate/Validation sit above
 * the default budget. Values below the provider's structured default are
 * no-ops; Groq remains capped by its structured budget.
 */
export const AGENT_MAX_TOKENS: Record<string, number> = {
  discovery: 3000,
  research: 3000,
  'business-analysis': 3000,
  'product-analysis': 3000,
  'requirements-engineering': 6000,
  'ux-design': 3000,
  'data-architecture': 3000,
  'ai-architecture': 3000,
  'solution-architecture': 3000,
  'security-review': 3000,
  'qa-planning': 6000,
  estimation: 3000,
  validation: 4000,
  debate: 5000,
  'gap-analysis': 3000,
  'gap-patch': 3000,
};

export interface AgentModelEnv {
  high?: string;
  standard?: string;
  fast?: string;
}

export function tierEnvName(tier: AgentModelTier): string {
  return `LLM_MODEL_${tier.toUpperCase()}`;
}

/** Resolve the model for an agent from env overrides, else the default model. */
export function resolveAgentModel(
  agentKey: string | undefined,
  env: AgentModelEnv,
  defaultModel: string,
): string {
  if (!agentKey) return defaultModel;
  const tier = AGENT_MODEL_TIERS[agentKey];
  if (!tier) return defaultModel;
  const override = env[tier]?.trim();
  return override || defaultModel;
}
