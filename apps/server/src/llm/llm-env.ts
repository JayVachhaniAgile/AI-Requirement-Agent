/**
 * Dynamic LLM env resolution.
 *
 * Preferred (provider-agnostic):
 *   LLM_PROVIDER  — openai | groq | ollama | custom | anthropic | …
 *   LLM_MODEL     — any model id the endpoint accepts
 *   LLM_API_KEY   — credential (optional for local ollama)
 *   LLM_BASE_URL  — OpenAI-compatible base URL (optional; provider defaults apply)
 *
 * Legacy provider-specific keys still work as fallbacks so existing .env
 * files keep running without edits.
 */

export type LlmProvider = 'openai' | 'groq' | 'ollama' | 'custom';

export interface ResolvedLlmConfig {
  provider: LlmProvider;
  apiKey: string;
  baseURL?: string;
  model: string;
}

export type EnvGetter = (key: string) => string | undefined;

const DEFAULT_GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434/v1';

const DEFAULT_MODELS: Record<LlmProvider, string> = {
  openai: 'gpt-4o',
  groq: 'llama-3.3-70b-versatile',
  ollama: 'llama3',
  custom: 'custom-model',
};

/** Map user-facing provider names onto the four runtime modes. */
const PROVIDER_ALIASES: Record<string, LlmProvider> = {
  openai: 'openai',
  groq: 'groq',
  ollama: 'ollama',
  custom: 'custom',
  'openai-compatible': 'custom',
  openai_compatible: 'custom',
  anthropic: 'custom',
  claude: 'custom',
  openrouter: 'custom',
  deepseek: 'custom',
  gemini: 'custom',
  google: 'custom',
  together: 'custom',
  mistral: 'custom',
  fireworks: 'custom',
};

function pick(...values: Array<string | undefined | null>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }
  return undefined;
}

function normalizeProvider(raw: string | undefined): LlmProvider | undefined {
  if (!raw) return undefined;
  const key = raw.trim().toLowerCase();
  return PROVIDER_ALIASES[key];
}

function inferProvider(get: EnvGetter): LlmProvider {
  if (pick(get('OLLAMA_BASE_URL'))) return 'ollama';
  if (pick(get('GROQ_API_KEY')) && !pick(get('OPENAI_API_KEY'), get('LLM_API_KEY'))) {
    return 'groq';
  }
  if (pick(get('CUSTOM_LLM_BASE_URL'), get('LLM_BASE_URL'))) return 'custom';
  return 'openai';
}

function resolveProvider(get: EnvGetter): LlmProvider {
  const explicit = normalizeProvider(get('LLM_PROVIDER'));
  if (explicit) return explicit;
  return inferProvider(get);
}

function resolveModel(get: EnvGetter, provider: LlmProvider): string {
  return (
    pick(
      get('LLM_MODEL'),
      // Legacy per-provider model names
      provider === 'ollama' ? get('OLLAMA_MODEL') : undefined,
      provider === 'groq' ? get('GROQ_MODEL') : undefined,
      provider === 'custom' ? get('CUSTOM_LLM_MODEL') : undefined,
      provider === 'openai' ? get('OPENAI_MODEL') : undefined,
      // Cross-provider leftovers (any leftover model var)
      get('OLLAMA_MODEL'),
      get('GROQ_MODEL'),
      get('CUSTOM_LLM_MODEL'),
      get('OPENAI_MODEL'),
    ) ?? DEFAULT_MODELS[provider]
  );
}

function resolveApiKey(get: EnvGetter, provider: LlmProvider): string {
  const key = pick(
    get('LLM_API_KEY'),
    get('OPENAI_API_KEY'),
    get('GROQ_API_KEY'),
    get('CUSTOM_LLM_API_KEY'),
    get('OLLAMA_API_KEY'),
  );

  if (key) return key;

  // Local / gateway providers often accept a placeholder key.
  if (provider === 'ollama') return 'ollama';
  if (provider === 'custom') return 'custom';

  throw new Error(
    `LLM_API_KEY is required when LLM_PROVIDER=${provider}. ` +
      `Set LLM_API_KEY (or the legacy OPENAI_API_KEY / GROQ_API_KEY).`,
  );
}

function resolveBaseUrl(get: EnvGetter, provider: LlmProvider): string | undefined {
  const explicit = pick(
    get('LLM_BASE_URL'),
    get('CUSTOM_LLM_BASE_URL'),
    get('OLLAMA_BASE_URL'),
    get('GROQ_BASE_URL'),
  );
  if (explicit) return explicit;

  if (provider === 'groq') return DEFAULT_GROQ_BASE_URL;
  if (provider === 'ollama') return DEFAULT_OLLAMA_BASE_URL;
  if (provider === 'custom') {
    throw new Error(
      'LLM_BASE_URL is required when LLM_PROVIDER is custom/anthropic/openrouter/etc. ' +
        'Set LLM_BASE_URL to an OpenAI-compatible endpoint (e.g. https://api.openai.com/v1 or your gateway).',
    );
  }
  // openai → SDK default (api.openai.com)
  return undefined;
}

/**
 * Resolve the active LLM client config from environment.
 * Generic `LLM_*` keys win; legacy provider-specific keys remain as fallbacks.
 */
export function resolveLlmConfig(get: EnvGetter): ResolvedLlmConfig {
  const provider = resolveProvider(get);
  return {
    provider,
    apiKey: resolveApiKey(get, provider),
    baseURL: resolveBaseUrl(get, provider),
    model: resolveModel(get, provider),
  };
}

/** Default model for tier routing — same resolution as the client model. */
export function resolveDefaultModel(get: EnvGetter): string {
  return resolveLlmConfig(get).model;
}
