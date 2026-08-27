import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmService, type LLMMessage } from '../llm/llm.service';
import type { AgentStructuredSchema } from '../llm/agent-json-schemas';
import { ValidationService } from '../validation/validation.service';
import type { AgentValidationFinding } from '../validation/validation.types';
import { RunLogService } from '../run-log/run-log.service';
import { getAgentVersions } from './agent-versions';
import { ModelUsageService } from '../foundation/observability/model-usage.service';

export interface AgentRetryRecord {
  /** 1-based attempt number that failed validation. */
  attempt: number;
  /** Human-readable failure reasons for this attempt. */
  reasons: string[];
}

export interface AgentRunOptions<T> {
  /** Workflow agent key, e.g. `requirements-engineering`. */
  agentKey: string;
  /** Project being processed (used for persisted run logs). */
  projectId?: string;
  /** Initial conversation (system + user messages). */
  messages: LLMMessage[];
  /** Forced structured-output schema for this agent. */
  schema: AgentStructuredSchema;
  /** Parses the raw LLM payload into the agent's typed output object. */
  parse: (content: string) => T;
  /** Upstream knowledge items whose IDs the validator can reference. */
  upstreamItems?: Array<{ externalId?: string | null }>;
  /** Retry attempts after the first call (spec: 2). */
  maxRetries?: number;
}

export interface AgentRunResult<T> {
  /** Final validated output, ready for the agent's post-processing. */
  output: T;
  /** Total LLM attempts used (1 + retries). */
  attempts: number;
  /** Every retry that was triggered, for logging/review (P2-3). */
  retries: AgentRetryRecord[];
  /** Token usage summed across all attempts. */
  tokens: { inputTokens: number; outputTokens: number; model: string };
}

/**
 * Raised when an agent exhausts the validation retry cap. The pipeline must
 * halt for this agent — no partial/corrupt result is returned to the caller.
 */
export class AgentValidationError extends Error {
  constructor(
    readonly agentKey: string,
    readonly attempts: number,
    readonly retries: AgentRetryRecord[],
    readonly finalFindings: AgentValidationFinding[],
  ) {
    super(
      `Agent '${agentKey}' failed output validation after ${attempts} attempts. ` +
        `Last issues: ${finalFindings.map((f) => f.message).join('; ') || 'none'}`,
    );
    this.name = 'AgentValidationError';
  }
}

/** Build the follow-up user message describing the specific failures found. */
export function buildCorrectionMessage(findings: AgentValidationFinding[]): string {
  const bullets = findings.slice(0, 20).map((f) => `- ${f.message}`);
  const overflow = findings.length > 20 ? `\n- … and ${findings.length - 20} more issues` : '';
  const emptyArrayNote = findings.some((f) => f.code === 'ARRAY_BELOW_MIN')
    ? `\nNOTE: An empty (or too-small) array is a hard failure. You MUST populate every array to at least its stated minimum with distinct, non-redundant items derived from the provided context. Never resubmit the same empty output.`
    : '';
  return (
    'Your previous output failed validation. Correct ALL of the following issues and ' +
    `resubmit the complete output:\n${bullets.join('\n')}${overflow}${emptyArrayNote}`
  );
}

/**
 * Wraps every agent LLM call (P0-2):
 * call → validate with the P0-3 validator → on failure, send a specific
 * correction message in the same conversation → re-validate. Caps retries at
 * `maxRetries` (2); past that, throws `AgentValidationError` so the pipeline
 * halts for this agent instead of silently proceeding with bad data.
 */
@Injectable()
export class AgentRunnerService {
  private readonly logger = new Logger(AgentRunnerService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly validation: ValidationService,
    private readonly runLog: RunLogService,
    private readonly config: ConfigService,
    @Optional() private readonly modelUsage?: ModelUsageService,
  ) {}

  async run<T>(options: AgentRunOptions<T>): Promise<AgentRunResult<T>> {
    // Env vars are strings; `"false"` is truthy — only skip when explicitly `"true"`.
    const skipValidation = this.config.get<string>('SKIP_VALIDATION') === 'true';
    const envRetries = Number(this.config.get<string>('AGENT_VALIDATION_MAX_RETRIES') ?? '');
    const defaultRetries =
      Number.isFinite(envRetries) && envRetries >= 0 ? envRetries : 2;
    const maxRetries = skipValidation ? 0 : (options.maxRetries ?? defaultRetries);
    const versions = options.agentKey ? getAgentVersions(options.agentKey) : undefined;
    const retries: AgentRetryRecord[] = [];
    let messages = [...options.messages];
    let inputTokens = 0;
    let outputTokens = 0;
    let model = 'unknown';

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const response = await this.llm.generateForcedStructured(messages, options.schema, {
        agentKey: options.agentKey,
      });
      const inTok = response.inputTokens ?? 0;
      const outTok = response.outputTokens ?? 0;
      inputTokens += inTok;
      outputTokens += outTok;
      model = response.model ?? model;

      if (options.projectId && this.modelUsage) {
        await this.modelUsage
          .record({
            projectId: options.projectId,
            skillKey: options.agentKey,
            model: response.model ?? model,
            inputTokens: inTok,
            outputTokens: outTok,
            metadata: { attempt: attempt + 1 },
          })
          .catch(() => undefined);
      }

      let output: T;
      let findings: AgentValidationFinding[] = [];
      let paddingFlags: AgentValidationFinding[] = [];
      let parseFailed = false;

      try {
        output = options.parse(response.content);
        if (!skipValidation) {
          const result = this.validation.validate(
            options.agentKey,
            output,
            options.upstreamItems ?? [],
          );
          findings = result.findings;
          paddingFlags = result.paddingFlags;
        }
      } catch (err: unknown) {
        parseFailed = true;
        const message = err instanceof Error ? err.message : String(err);
        findings = [
          {
            code: 'MISSING_FIELD',
            field: 'output',
            value: undefined,
            message: `Output failed to parse: ${message}`,
          },
        ];
        output = {} as T;
      }

      if (skipValidation || findings.length === 0) {
        for (const flag of paddingFlags) {
          if (options.projectId) {
            await this.runLog.logPadding(
              options.projectId,
              options.agentKey,
              flag.message,
              { field: flag.field },
              versions,
            );
          }
        }
        // P2-3: persist explicit low-confidence flags from the agent's contract.
        const contractFlags = (
          output as {
            lowConfidenceFlags?: Array<{ field: string; reason: string }>;
          }
        ).lowConfidenceFlags;
        if (options.projectId && Array.isArray(contractFlags)) {
          for (const flag of contractFlags) {
            await this.runLog.logLowConfidence(
              options.projectId,
              options.agentKey,
              `Low-confidence field '${flag.field}': ${flag.reason}`,
              { field: flag.field, reason: flag.reason },
              versions,
            );
          }
        }
        return {
          output,
          attempts: attempt + 1,
          retries,
          tokens: { inputTokens, outputTokens, model },
        };
      }

      if (!skipValidation) {
        const reasons = findings.map((f) => f.message);
        retries.push({ attempt: attempt + 1, reasons });
        if (options.projectId) {
          await this.runLog.logRetry(
            options.projectId,
            options.agentKey,
            attempt + 1,
            reasons,
            findings.map((f) => f.code),
            parseFailed,
            versions,
          );
        }
        this.logger.warn(
          `Agent '${options.agentKey}' failed validation on attempt ${attempt + 1}: ${reasons.join(' | ')}`,
        );

        if (attempt === maxRetries) {
          if (options.projectId) {
            await this.runLog.logValidationFailure(
              options.projectId,
              options.agentKey,
              attempt + 1,
              findings,
              versions,
            );
          }
          throw new AgentValidationError(options.agentKey, attempt + 1, retries, findings);
        }

        // Same conversation: truncated assistant response (to prevent context explosion) + the correction.
        const contentForHistory =
          response.content.length > 1000
            ? `${response.content.slice(0, 1000)}\n... [truncated to conserve context window budget]`
            : response.content;

        messages = [
          ...messages,
          { role: 'assistant', content: contentForHistory },
          { role: 'user', content: buildCorrectionMessage(findings) },
        ];
      } else {
        // Skip validation - return immediately on first attempt
        return {
          output,
          attempts: attempt + 1,
          retries: [],
          tokens: { inputTokens, outputTokens, model },
        };
      }
    }

    throw new AgentValidationError(options.agentKey, maxRetries + 1, retries, []);
  }
}
