import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

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

type LlmProvider = 'openai' | 'groq' | 'ollama';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const OLLAMA_BASE_URL = 'http://localhost:11434/v1';
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_OPENAI_MODEL = 'gpt-4o';

/** Groq free/on_demand TPM is tight; keep request size well under the limit. */
const GROQ_INPUT_CHAR_BUDGET = 28_000; // ~7k tokens
const GROQ_STRUCTURED_MAX_TOKENS = 4096;
const GROQ_TEXT_MAX_TOKENS = 8192;

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
    last.content += '\n\nIMPORTANT: You must respond in JSON format as specified in the instructions. Your response must be valid JSON.';
  }
  return copy;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly provider: LlmProvider;
  /** Whether the current provider/model supports response_format json_object */
  private readonly supportsJsonMode: boolean;

  constructor(private readonly config: ConfigService) {
    this.provider = this.resolveProvider(config);
    const { apiKey, baseURL, model } = this.resolveClientConfig(config, this.provider);

    this.client = new OpenAI({ apiKey, baseURL });
    this.model = model;
    this.supportsJsonMode = this.provider === 'openai'; // ollama and groq may not support json_object response_format
    this.logger.log(`LLM provider=${this.provider} model=${this.model} jsonMode=${this.supportsJsonMode}`);
  }

  private resolveProvider(config: ConfigService): LlmProvider {
    const explicit = (config.get<string>('LLM_PROVIDER') ?? '').trim().toLowerCase();
    if (explicit === 'ollama') return 'ollama';
    if (explicit === 'groq' || explicit === 'openai') return explicit;

    if (config.get<string>('OLLAMA_BASE_URL')) return 'ollama';
    if (config.get<string>('GROQ_API_KEY') && !config.get<string>('OPENAI_API_KEY')) {
      return 'groq';
    }
    return 'openai';
  }

  private resolveClientConfig(
    config: ConfigService,
    provider: LlmProvider,
  ): { apiKey: string; baseURL?: string; model: string } {
    if (provider === 'ollama') {
      const baseURL = config.get<string>('OLLAMA_BASE_URL') ?? OLLAMA_BASE_URL;
      return {
        apiKey: 'ollama',
        baseURL,
        model: config.get<string>('OLLAMA_MODEL') ?? 'llama3',
      };
    }
    if (provider === 'groq') {
      const apiKey = config.get<string>('GROQ_API_KEY') ?? config.get<string>('OPENAI_API_KEY');
      if (!apiKey) {
        throw new Error('GROQ_API_KEY is required when LLM_PROVIDER=groq');
      }
      return {
        apiKey,
        baseURL: GROQ_BASE_URL,
        model:
          config.get<string>('GROQ_MODEL')
          ?? config.get<string>('OPENAI_MODEL')
          ?? DEFAULT_GROQ_MODEL,
      };
    }

    const apiKey = config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required when LLM_PROVIDER=openai');
    }
    return {
      apiKey,
      model: config.get<string>('OPENAI_MODEL') ?? DEFAULT_OPENAI_MODEL,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Truncate the largest user message so Groq requests stay under TPM limits. */
  private fitMessages(messages: LLMMessage[]): LLMMessage[] {
    if (this.provider !== 'groq') return messages;

    const total = messages.reduce((sum, m) => sum + m.content.length, 0);
    if (total <= GROQ_INPUT_CHAR_BUDGET) return messages;

    const fitted = messages.map((m) => ({ ...m }));
    const userIndexes = fitted
      .map((m, i) => (m.role === 'user' ? i : -1))
      .filter((i) => i >= 0);

    let overflow = total - GROQ_INPUT_CHAR_BUDGET;
    for (const idx of userIndexes.reverse()) {
      if (overflow <= 0) break;
      const msg = fitted[idx];
      if (!msg) continue;
      const keep = Math.max(1_000, msg.content.length - overflow);
      if (keep < msg.content.length) {
        msg.content = `${msg.content.slice(0, keep)}\n\n[truncated for Groq token budget]`;
        overflow = fitted.reduce((sum, m) => sum + m.content.length, 0) - GROQ_INPUT_CHAR_BUDGET;
      }
    }

    this.logger.warn(
      `Truncated LLM prompt for Groq budget (${total} → ${fitted.reduce((s, m) => s + m.content.length, 0)} chars)`,
    );
    return fitted;
  }

  private maxTokens(kind: 'structured' | 'text'): number {
    if (this.provider === 'groq') {
      return kind === 'structured' ? GROQ_STRUCTURED_MAX_TOKENS : GROQ_TEXT_MAX_TOKENS;
    }
    return kind === 'structured' ? 4096 : 8192;
  }

  /**
   * Generate a structured (JSON) response from the LLM.
   * Uses response_format json_object when supported; falls back to text-only
   * with a "respond in JSON" prompt instruction.
   */
  async generateStructured(messages: LLMMessage[], maxRetries = 3): Promise<LLMResult> {
    const withJson = ensureJsonKeyword(messages);
    const fitted = this.fitMessages(withJson);
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) await this.sleep(Math.pow(2, attempt) * 1500);
        
        const createParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
          model: this.model,
          messages: fitted,
          max_tokens: this.maxTokens('structured'),
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
          model: this.model,
        };
      } catch (err: unknown) {
        const apiError = err as { status?: number; message?: string };
        // If json_object is rejected despite our efforts, fall back to text mode
        if (apiError?.status === 400 && this.supportsJsonMode && String(apiError?.message ?? '').includes('json')) {
          this.logger.warn(`JSON mode rejected, falling back to text mode for this call`);
          try {
            const response = await this.client.chat.completions.create({
              model: this.model,
              messages: fitted,
              max_tokens: this.maxTokens('structured'),
            });
            const content = response.choices[0]?.message?.content ?? '{}';
            return {
              content,
              inputTokens: response.usage?.prompt_tokens ?? 0,
              outputTokens: response.usage?.completion_tokens ?? 0,
              model: this.model,
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
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: fitted,
          max_tokens: this.maxTokens('text'),
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
}
