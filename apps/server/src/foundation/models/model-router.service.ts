import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveModelRoute, type ModelRoute } from './model-router.policy';
import type { AgentModelEnv } from '../../llm/agent-model.config';
import { resolveDefaultModel } from '../../llm/llm-env';

/**
 * Model Router (new architecture).
 *
 * Thin NestJS wrapper around the pure `resolveModelRoute` policy. Resolves
 * provider/model overrides from env once per request.
 */
@Injectable()
export class ModelRouterService {
  constructor(private readonly config: ConfigService) {}

  route(input: {
    skillKey?: string;
    largeOutput?: boolean;
    maxTokens?: number;
    provider?: string;
  }): ModelRoute {
    const get = (key: string) => this.config.get<string>(key);
    const provider = input.provider ?? get('LLM_PROVIDER') ?? 'openai';
    const env: AgentModelEnv = {
      high: get('LLM_MODEL_HIGH'),
      standard: get('LLM_MODEL_STANDARD'),
      fast: get('LLM_MODEL_FAST'),
    };
    // Prefer generic LLM_MODEL (and legacy fallbacks) so tier routing never
    // hardcodes a provider-specific model name.
    const defaultModel = resolveDefaultModel(get);
    return resolveModelRoute({
      skillKey: input.skillKey,
      provider,
      modelOverrides: env,
      defaultModel,
      largeOutput: input.largeOutput,
      maxTokens: input.maxTokens,
    });
  }
}
