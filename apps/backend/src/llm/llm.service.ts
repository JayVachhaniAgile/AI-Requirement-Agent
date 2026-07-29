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

type LlmProvider = 'openai' | 'groq';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_OPENAI_MODEL = 'gpt-4o';

/** Groq free/on_demand TPM is tight; keep request size well under the limit. */
const GROQ_INPUT_CHAR_BUDGET = 28_000; // ~7k tokens
const GROQ_STRUCTURED_MAX_TOKENS = 2048;
const GROQ_TEXT_MAX_TOKENS = 8192;

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly provider: LlmProvider;

  constructor(private readonly config: ConfigService) {
    this.provider = this.resolveProvider(config);
    const { apiKey, baseURL, model } = this.resolveClientConfig(config, this.provider);

    this.client = new OpenAI({ apiKey, baseURL });
    this.model = model;
    this.logger.log(`LLM provider=${this.provider} model=${this.model}`);
  }

  private resolveProvider(config: ConfigService): LlmProvider {
    const explicit = (config.get<string>('LLM_PROVIDER') ?? '').trim().toLowerCase();
    if (explicit === 'groq' || explicit === 'openai') return explicit;

    if (config.get<string>('GROQ_API_KEY') && !config.get<string>('OPENAI_API_KEY')) {
      return 'groq';
    }
    return 'openai';
  }

  private resolveClientConfig(
    config: ConfigService,
    provider: LlmProvider,
  ): { apiKey: string; baseURL?: string; model: string } {
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

  async generateStructured(messages: LLMMessage[], maxRetries = 3): Promise<LLMResult> {
    const fitted = this.fitMessages(messages);
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) await this.sleep(Math.pow(2, attempt) * 1500);
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: fitted,
          response_format: { type: 'json_object' },
          max_tokens: this.maxTokens('structured'),
        });
        return {
          content: response.choices[0]?.message?.content ?? '{}',
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
          model: this.model,
        };
      } catch (err) {
        this.logger.warn(`LLM structured call failed (attempt ${attempt + 1}): ${err}`);
        if (attempt === maxRetries - 1) throw err;
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
