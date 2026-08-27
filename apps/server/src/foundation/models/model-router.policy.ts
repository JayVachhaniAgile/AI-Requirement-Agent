/**
 * Pure model routing policy (new architecture).
 *
 * Deterministic: given a skill/agent key, task requirements, provider and
 * model overrides, produce the model + structured-output mode + token cap.
 * Reuses the existing tier/mode resolution from the legacy LLM layer so the
 * new router stays consistent with the running pipeline.
 */

import {
  AGENT_MAX_TOKENS,
  AGENT_MODEL_TIERS,
  resolveAgentModel,
  type AgentModelTier,
} from '../../llm/agent-model.config';
import { resolveStructuredMode } from '../../llm/model-compat';
import type { StructuredMode } from '../../llm/model-compat';

export interface ModelRouterInput {
  /** Skill/agent key (e.g. `requirements-engineering`). Falls back to default. */
  skillKey?: string;
  provider?: string;
  /** LLM_MODEL_HIGH / STANDARD / FAST overrides, already read from env. */
  modelOverrides?: { high?: string; standard?: string; fast?: string };
  defaultModel?: string;
  /** When true, require the largest token budget (e.g. document compilers). */
  largeOutput?: boolean;
  /** Explicit max tokens override (overrides the skill floor). */
  maxTokens?: number;
}

export interface ModelRoute {
  skillKey: string | null;
  provider: string;
  model: string;
  tier: AgentModelTier | null;
  mode: StructuredMode;
  maxTokens: number;
  rationale: string[];
}

const DEFAULT_MODEL = 'gpt-4o';

export function resolveModelRoute(input: ModelRouterInput): ModelRoute {
  const provider = (input.provider ?? 'openai').toLowerCase();
  const defaultModel = input.defaultModel ?? DEFAULT_MODEL;
  const skillKey = input.skillKey ?? null;
  const tier = skillKey ? (AGENT_MODEL_TIERS[skillKey] ?? null) : null;
  const model = resolveAgentModel(skillKey ?? undefined, input.modelOverrides ?? {}, defaultModel);

  const rationale: string[] = [];
  if (tier) {
    rationale.push(`skill '${skillKey}' is tier '${tier}'`);
  } else {
    rationale.push('no tier mapping — using default model');
  }

  const mode = resolveStructuredMode(provider, model);
  rationale.push(`provider '${provider}' resolves to '${mode}' mode`);

  const floor = skillKey ? (AGENT_MAX_TOKENS[skillKey] ?? 3000) : 3000;
  const maxTokens = input.maxTokens ?? (input.largeOutput ? Math.max(floor, 6000) : floor);
  rationale.push(`max tokens ${maxTokens}`);

  return {
    skillKey,
    provider,
    model,
    tier,
    mode,
    maxTokens,
    rationale,
  };
}
