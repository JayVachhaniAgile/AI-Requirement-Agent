import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AGENT_MAX_TOKENS, resolveAgentModel, tierEnvName } from './agent-model.config';
import { resolveStructuredMode } from './model-compat';
import { ModelRouterService } from '../foundation/models/model-router.service';
import { resolveLlmConfig, type LlmProvider } from './llm-env';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface ForcedStructuredCall {
  /** Tool the model must invoke, e.g. `submit_discovery_output`. */
  toolName: string;
  /** JSON Schema matching the agent's output contract. */
  schema: Record<string, unknown>;
}

export interface ToolCallParamsInput {
  model: string;
  messages: LLMMessage[];
  maxTokens?: number;
  toolName: string;
  schema: Record<string, unknown>;
}

/**
 * Build Chat Completions params that force the model to invoke exactly one
 * tool. The tool arguments become the entire payload — no markdown fences or
 * prose to strip.
 */
export function buildForcedToolParams(
  input: ToolCallParamsInput,
): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
  return {
    model: input.model,
    messages: input.messages,
    ...(input.maxTokens !== undefined ? { max_tokens: input.maxTokens } : {}),
    tools: [
      {
        type: 'function',
        function: {
          name: input.toolName,
          description:
            'Submit the complete structured output payload. The tool arguments are the entire response.',
          parameters: input.schema,
        },
      },
    ],
    tool_choice: { type: 'function', function: { name: input.toolName } },
  };
}

/**
 * Build Chat Completions params constrained by a JSON Schema via
 * `response_format` (OpenAI-only fallback when forced tools are unavailable).
 */
export function buildJsonSchemaParams(
  input: ToolCallParamsInput,
): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
  return {
    model: input.model,
    messages: input.messages,
    ...(input.maxTokens !== undefined ? { max_tokens: input.maxTokens } : {}),
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: input.toolName,
        schema: input.schema,
        strict: false,
      },
    },
  };
}

/**
 * Extract the JSON payload from a forced tool call. Returns the raw arguments
 * string, or null when the response carries no tool call.
 */
export function extractToolCallArguments(response: unknown): string | null {
  const message = (
    response as {
      choices?: Array<{
        message?: {
          tool_calls?: Array<{ function?: { arguments?: unknown } }>;
        };
      }>;
    }
  )?.choices?.[0]?.message;
  const raw = message?.tool_calls?.[0]?.function?.arguments;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
}

type LlmProviderRuntime = LlmProvider;

const DEFAULT_LLM_TIMEOUT_MS = 120_000;

/** Groq no longer uses a hard prompt-budget or output ceiling. */
const DEFAULT_STRUCTURED_MAX_TOKENS = 4096;
const DEFAULT_TEXT_MAX_TOKENS = 8192;

/**
 * Ensure "json" appears somewhere in the messages so OpenAI's json_object
 * response_format doesn't reject the request.
 */
function ensureJsonKeyword(messages: LLMMessage[]): LLMMessage[] {
  const joined = messages.map((m) => m.content).join(' ');
  if (/json/i.test(joined)) return messages;
  // Append a note to the last user message
  const copy = messages.map((m) => ({ ...m }));
  const last = copy[copy.length - 1];
  if (last) {
    last.content +=
      '\n\nIMPORTANT: You must respond in JSON format as specified in the instructions. Your response must be valid JSON.';
  }
  return copy;
}

/**
 * Build a concise shape hint from an agent's JSON Schema so the model always
 * knows which top-level keys its response must contain — even when the API
 * layer cannot force the shape (json_object / prompt-only providers).
 */
export function buildSchemaHint(schema: Record<string, unknown>): string {
  const properties =
    (schema.properties as Record<string, unknown> | undefined) ?? {};
  const keys = Object.keys(properties);
  const required = Array.isArray(schema.required)
    ? (schema.required as unknown[]).map(String)
    : [];
  if (keys.length === 0) return '';
  const requiredNote =
    required.length > 0
      ? `\n- Required fields: ${required.join(', ')}`
      : '';
  return (
    `\n\nThe JSON object MUST be a single object with EXACTLY these top-level keys: ${keys.join(', ')}.` +
    `\n- Produce every key; do not rename, nest, or omit any.` +
    `\n- Omit optional keys only when their value would be empty.` +
    requiredNote
  );
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly provider: LlmProviderRuntime;
  /** Whether the current provider/model supports response_format json_object */
  private readonly supportsJsonMode: boolean;
  /** Whether the provider supports forced tool-use with a specific function */
  private readonly supportsForcedTools: boolean;
  /** Whether the provider supports response_format json_schema */
  private readonly supportsJsonSchemaMode: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly modelRouter: ModelRouterService,
  ) {
    const resolved = resolveLlmConfig((key) => this.config.get<string>(key));
    this.provider = resolved.provider;

    const timeoutRaw = Number(config.get<string>('LLM_TIMEOUT_MS') ?? DEFAULT_LLM_TIMEOUT_MS);
    const timeout =
      Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : DEFAULT_LLM_TIMEOUT_MS;

    this.client = new OpenAI({
      apiKey: resolved.apiKey,
      baseURL: resolved.baseURL,
      timeout,
    });
    this.model = resolved.model;
    const structuredMode = resolveStructuredMode(this.provider, this.model, this.logger);
    // forced-tools / json-schema providers can drive the shape via the API;
    // everything else falls back to json_object + in-prompt schema hints.
    this.supportsJsonMode = structuredMode === 'json-object';
    this.supportsForcedTools = structuredMode === 'forced-tools';
    // custom (OpenAI-compatible proxy) may accept response_format json_schema
    // even when tool_choice is rejected in thinking mode.
    this.supportsJsonSchemaMode =
      structuredMode === 'json-schema' ||
      structuredMode === 'forced-tools' ||
      this.provider === 'custom';
    this.logger.log(
      `LLM provider=${this.provider} model=${this.model} baseURL=${resolved.baseURL ?? 'default'} mode=${structuredMode} jsonMode=${this.supportsJsonMode} forcedTools=${this.supportsForcedTools}`,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Keep prompts intact; Groq no longer gets a hard input-budget truncation. */
  private fitMessages(messages: LLMMessage[]): LLMMessage[] {
    return messages;
  }

  /**
   * Resolve the max_tokens value for an LLM request.
   *
   * - LLM_MAX_TOKENS env var: when set to a positive number, that cap is used
   *   for every request (structured + text).
   * - Unset: no max_tokens is sent, so the provider is free to return more
   *   output (e.g. the model's full context window) instead of the old
   *   hard-coded 4096/8192 caps.
   * - Groq: no max_tokens is sent (it enforces its own output budget).
   */
  private maxTokens(kind: 'structured' | 'text'): number | undefined {
    if (this.provider === 'groq') return undefined;
    // LLM_MAX_TOKENS is preferred; AGENT_MAX_TOKENS is accepted as an alias
    // (used in some local .env files for a global output ceiling).
    const configured =
      this.config.get<string>('LLM_MAX_TOKENS') ??
      this.config.get<string>('AGENT_MAX_TOKENS');
    if (configured !== undefined && configured.trim() !== '') {
      const n = Number(configured);
      if (Number.isFinite(n) && n > 0) return Math.round(n);
    }
    return undefined;
  }

  /** Per-agent max_tokens floor for providers that still use a cap. */
  private maxTokensForAgent(kind: 'structured' | 'text', agentKey?: string): number | undefined {
    const base = this.maxTokens(kind);
    if (kind !== 'structured' || !agentKey || base === undefined) return base;
    const floor = AGENT_MAX_TOKENS[agentKey];
    if (!floor) return base;
    return Math.max(base, floor);
  }

  /** Resolve the model for a specific agent (P2-2 tiering), else the default.
   *  Routed through the Model Router so provider/model overrides, tier
   *  mappings and token floors stay in one place. */
  getModelForAgent(agentKey?: string): string {
    try {
      return this.modelRouter.route({ skillKey: agentKey }).model;
    } catch {
      // Fall back to the legacy resolver if the router is unavailable.
      return resolveAgentModel(
        agentKey,
        {
          high: this.config.get<string>(tierEnvName('high')),
          standard: this.config.get<string>(tierEnvName('standard')),
          fast: this.config.get<string>(tierEnvName('fast')),
        },
        this.model,
      );
    }
  }

  /**
   * Generate a structured (JSON) response from the LLM.
   * Uses response_format json_object when supported; falls back to text-only
   * with a "respond in JSON" prompt instruction.
   */
  async generateStructured(
    messages: LLMMessage[],
    maxRetries = 3,
    schema?: Record<string, unknown>,
  ): Promise<LLMResult> {
    return this.generateStructuredWithModel(messages, maxRetries, this.model, schema);
  }

  private async generateStructuredWithModel(
    messages: LLMMessage[],
    maxRetries: number,
    model: string,
    schema?: Record<string, unknown>,
  ): Promise<LLMResult> {
    // Embed the schema directly in the system prompt so the model produces
    // JSON whose keys match the agent's Zod contract — response_format only
    // guarantees valid JSON, not the correct shape.
    const withJson = ensureJsonKeyword(messages);
    const schemaHint = schema
      ? buildSchemaHint(schema)
      : '';
    const withSchema = withJson.map((m, i) =>
      i === 0 ? { ...m, content: m.content + schemaHint } : m,
    );
    const fitted = this.fitMessages(withSchema);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) await this.sleep(Math.pow(2, attempt) * 1500);

        const maxTokens = this.maxTokens('structured');
        const createParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
          model,
          messages: fitted,
          ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
        };

        // Only use response_format json_object when provider supports it
        if (this.supportsJsonMode) {
          createParams.response_format = { type: 'json_object' };
        }

        const response = await this.client.chat.completions.create(createParams);
        const content = response.choices[0]?.message?.content ?? '{}';

        return {
          content,
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
          model,
        };
      } catch (err: unknown) {
        const apiError = err as { status?: number; message?: string };
        // If json_object is rejected despite our efforts, fall back to text mode
        if (
          apiError?.status === 400 &&
          (this.supportsJsonMode || this.provider === 'custom') &&
          (String(apiError?.message ?? '').includes('json') || this.provider === 'custom')
        ) {
          this.logger.warn(`JSON mode rejected, falling back to text mode for this call`);
          try {
            const maxTokens = this.maxTokens('structured');
            const response = await this.client.chat.completions.create({
              model,
              messages: fitted,
              ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
            });
            const content = response.choices[0]?.message?.content ?? '{}';
            return {
              content,
              inputTokens: response.usage?.prompt_tokens ?? 0,
              outputTokens: response.usage?.completion_tokens ?? 0,
              model,
            };
          } catch (fallbackErr: unknown) {
            this.logger.warn(`LLM structured call failed (attempt ${attempt + 1}): ${fallbackErr}`);
            if (attempt === maxRetries - 1) throw fallbackErr;
          }
        } else {
          this.logger.warn(`LLM structured call failed (attempt ${attempt + 1}): ${err}`);
          if (attempt === maxRetries - 1) throw err;
        }
      }
    }
    throw new Error('LLM unreachable after retries');
  }

  async generateText(messages: LLMMessage[], maxRetries = 3): Promise<LLMResult> {
    const fitted = this.fitMessages(messages);
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) await this.sleep(Math.pow(2, attempt) * 1500);
        const maxTokens = this.maxTokens('text');
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: fitted,
          ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
        });
        return {
          content: response.choices[0]?.message?.content ?? '',
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
          model: this.model,
        };
      } catch (err) {
        this.logger.warn(`LLM text call failed (attempt ${attempt + 1}): ${err}`);
        if (attempt === maxRetries - 1) throw err;
      }
    }
    throw new Error('LLM unreachable after retries');
  }

  /**
   * Generate a structured response guaranteed by the API layer (P0-1):
   * the model is forced to invoke a single tool whose input schema is the
   * agent's JSON Schema. Falls back to prompt-constrained JSON only when the
   * provider rejects the tool/json_schema mechanism, so a free-text response
   * is never the first-class path.
   */
  async generateForcedStructured(
    messages: LLMMessage[],
    call: ForcedStructuredCall,
    options?: { agentKey?: string; maxRetries?: number },
  ): Promise<LLMResult> {
    const fitted = this.fitMessages(messages);
    const maxTokens = this.maxTokensForAgent('structured', options?.agentKey);
    const model = this.getModelForAgent(options?.agentKey);
    const maxRetries = options?.maxRetries ?? 3;

   const forcedCall = async (): Promise<LLMResult> => {
      if (this.supportsForcedTools) {
        const response = await this.client.chat.completions.create(
          buildForcedToolParams({
            model,
            messages: fitted,
            maxTokens,
            toolName: call.toolName,
            schema: call.schema,
          }),
        );
        const content =
          extractToolCallArguments(response) ?? response.choices[0]?.message?.content ?? '{}';
        return {
          content,
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
          model,
        };
      }

      const response = await this.client.chat.completions.create(
        buildJsonSchemaParams({
          model,
          messages: fitted,
          maxTokens,
          toolName: call.toolName,
          schema: call.schema,
        }),
      );
      return {
        content: response.choices[0]?.message?.content ?? '{}',
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
        model,
      };
    };

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) await this.sleep(Math.pow(2, attempt) * 1500);
        return await forcedCall();
      } catch (err: unknown) {
        const apiError = err as { status?: number; message?: string };
        this.logger.warn(
          `Forced structured call failed (attempt ${attempt + 1}): ${apiError?.message ?? err}`,
        );

        // Provider rejected the forced tool / json_schema mechanism (e.g. 400,
        // model without tool support). Fall back to prompt-constrained JSON
        // rather than burning more retries on the same failing strategy.
        if (
          (apiError?.status === 400 && String(apiError?.message ?? '').includes('tool_choice')) ||
          (apiError?.status === 400 && this.provider === 'custom') ||
          apiError?.status === 400 ||
          attempt === maxRetries - 1
        ) {
         this.logger.warn('Using prompt-constrained JSON fallback for this call');
          return this.generateStructuredWithModel(fitted, maxRetries, model, call.schema);
        }
      }
    }
    throw new Error('LLM unreachable after retries');
  }
}
