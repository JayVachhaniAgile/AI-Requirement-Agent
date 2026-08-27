import { Logger } from '@nestjs/common';

export type StructuredMode =
  | 'forced-tools'
  | 'json-schema'
  | 'json-object'
  | 'prompt-only';

/**
 * Known provider/model structured-output capabilities (P0-1). Every entry
 * declares which API mechanism the model supports so a provider or model
 * change never silently produces a mismatched payload — the mode is picked
 * explicitly and the schema is still injected into the prompt as a hint.
 */
export const MODEL_COMPAT: Record<string, StructuredMode> = {
  // OpenAI: full tool-forcing + json_schema support.
  openai: 'forced-tools',
  // Groq: tool calls supported on current models.
  groq: 'forced-tools',
  // Custom OpenAI-compatible proxies (e.g. Anthropic Console gateway):
  // tool_choice is frequently rejected in thinking mode, so constrain with
  // json_object plus an in-prompt schema hint.
  custom: 'json-object',
  // Local Ollama: no reliable response_format or tool_choice.
  ollama: 'prompt-only',
};

const DEFAULT_MODE: StructuredMode = 'json-object';

/** Best-effort structured mode for a provider/model string pair. */
export function resolveStructuredMode(
  provider: string,
  model: string,
  logger?: Logger,
): StructuredMode {
  const key = provider.toLowerCase();
  const byProvider = MODEL_COMPAT[key];
  if (byProvider) return byProvider;

  // Unknown provider: heuristically detect model families we know reject
  // tool_choice (Anthropic in thinking mode, etc.).
  const lower = model.toLowerCase();
  if (lower.includes('claude')) {
    if (logger) logger.warn(`Unknown provider '${provider}' for model '${model}' — treating as json-object mode`);
    return 'json-object';
  }
  if (logger) logger.warn(`Unknown provider '${provider}' — defaulting to ${DEFAULT_MODE} mode`);
  return DEFAULT_MODE;
}

/** True when the resolved mode must fall back to prompt-constrained JSON. */
export function isPromptConstrained(mode: StructuredMode): boolean {
  return mode === 'json-object' || mode === 'prompt-only';
}
