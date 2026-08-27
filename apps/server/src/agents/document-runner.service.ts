import { Injectable, Logger } from '@nestjs/common';
import { LlmService, type LLMMessage } from '../llm/llm.service';
import { RunLogService } from '../run-log/run-log.service';
import {
  DOCUMENT_ID_PATTERNS,
  checkDocumentDrift,
  extractDocumentIds,
} from '../validation/document-drift';

/**
 * Raised when a document still omits source items after the retry cap.
 * The workflow marks the stage FAILED — an incomplete document is never
 * silently saved.
 */
export class DocumentDriftError extends Error {
  constructor(
    readonly agentKey: string,
    readonly attempts: number,
    readonly missing: string[],
  ) {
    super(
      `Document '${agentKey}' missing source items after ${attempts} attempts: ${missing.join(', ')}`,
    );
    this.name = 'DocumentDriftError';
  }
}

export interface GenerateDocumentOptions {
  /** Doc-generator agent key, e.g. `frd` (drift patterns keyed by this). */
  agentKey: string;
  projectId?: string;
  /** System + user messages for the document generation call. */
  messages: LLMMessage[];
  /** Source knowledge items whose IDs the document must preserve. */
  knowledgeItems: Array<{ externalId?: string | null }>;
  /** Explicit source IDs to enforce for this document generation call. */
  requiredSourceIds?: string[];
  /** Correction retries after the first attempt (default 2). */
  maxRetries?: number;
}

/**
 * Generates markdown documents with completeness enforcement: after each LLM
 * call, every source ID expected in that document must appear in the output.
 * Missing IDs trigger a correction request in the same conversation; after
 * `maxRetries`, the document is rejected (`DocumentDriftError`) instead of
 * shipping incomplete. Invented IDs are logged as informational drift only.
 */
@Injectable()
export class DocumentRunnerService {
  private readonly logger = new Logger(DocumentRunnerService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly runLog: RunLogService,
  ) {}

  async generateDocument(options: GenerateDocumentOptions): Promise<{
    content: string;
    attempts: number;
    tokens: { inputTokens: number; outputTokens: number; model: string };
  }> {
    const patterns = DOCUMENT_ID_PATTERNS[options.agentKey];
    const maxRetries = options.maxRetries ?? 2;
    // SOW may omit some source items without failing the stage.
    const isSow = options.agentKey === 'sow';

    const sourceIds = new Set<string>();
    if (patterns) {
      const explicitIds = options.requiredSourceIds?.filter(Boolean) ?? [];
      // Add all explicitly required source IDs regardless of pattern matching.
      if (explicitIds.length > 0) {
        for (const id of explicitIds) {
          sourceIds.add(id);
        }
      } else {
          // No explicit IDs provided; derive source IDs from knowledge items.
    for (const item of options.knowledgeItems) {
      if (item.externalId) {
        // Extract IDs that match the document patterns.
        const matchedIds = extractDocumentIds(item.externalId, patterns ?? []);
        if (matchedIds.size > 0) {
          for (const id of matchedIds) {
            sourceIds.add(id);
          }
        } else if (options.projectId) {
          // Log a warning when a knowledge item yields no pattern matches – helps spot stray GUIDs.
          await this.runLog.log(
            options.projectId,
            options.agentKey,
            'drift',
            `Knowledge item externalId ${item.externalId} produced no matching source IDs for patterns`,
            { externalId: item.externalId },
          );
        }
      }
    }

      }
    }

    let messages = [...options.messages];
    let inputTokens = 0;
    let outputTokens = 0;
    let model = 'document-generator';

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const response = await this.llm.generateText(
        attempt === 0
          ? [
              ...messages,
              {
                role: 'user',
                content:
                  'Write a substantially detailed, comprehensive document. ' +
                  'Do not produce a short summary. Expand every section with concrete business behavior, user flows, validations, assumptions, dependencies, edge cases, and examples. ' +
                  'If the source context has rich detail, use it fully; do not truncate the content to a terse overview.',
              },
            ]
          : messages,
      );

      inputTokens += response.inputTokens ?? 0;
      outputTokens += response.outputTokens ?? 0;
      model = response.model ?? model;

      // No patterns (e.g. compiler) or no source IDs: nothing to enforce.
      if (!patterns || sourceIds.size === 0) {
        return { content: response.content, attempts: attempt + 1, tokens: { inputTokens, outputTokens, model } };
      }

      const drift = checkDocumentDrift({
        markdown: response.content,
        sourceIds,
        patterns,
      });

      if (options.projectId && drift.invented.length > 0) {
        await this.runLog.log(
          options.projectId,
          options.agentKey,
          'drift',
          `Document '${options.agentKey}' references ${drift.invented.length} IDs not in the source`,
          { invented: drift.invented },
        );
      }

      if (drift.missing.length === 0) {
        return { content: response.content, attempts: attempt + 1, tokens: { inputTokens, outputTokens, model } };
      }

      if (options.projectId) {
        await this.runLog.log(
          options.projectId,
          options.agentKey,
          'drift',
          `Document '${options.agentKey}' missing ${drift.missing.length} source items on attempt ${attempt + 1}`,
          { missing: drift.missing, attempt: attempt + 1 },
        );
      }
      this.logger.warn(
        `Document '${options.agentKey}' missing source items (attempt ${attempt + 1}): ${drift.missing.join(', ')}`,
      );

      if (options.agentKey === 'user-stories' || isSow) {
        return { content: response.content, attempts: attempt + 1, tokens: { inputTokens, outputTokens, model } };
      }

      if (attempt === maxRetries) {
        throw new DocumentDriftError(options.agentKey, attempt + 1, drift.missing);
      }

      const correctionContent =
        `Your document is missing source items that MUST be included. ` +
        `Add each one with its exact ID and complete details: ${drift.missing.join(', ')}. ` +
        `Use each missing source ID as an explicit heading or dedicated entry in the document. ` +
        `Do not omit any source item.` +
        (options.agentKey === 'sow'
          ? ' Ensure each missing FEAT-xxx and MOD-xxx appears as a separate entry in the High-Level Features & Modifications section.'
          : '');

      messages = [
        ...messages,
        { role: 'assistant', content: response.content },
        {
          role: 'user',
          content: correctionContent,
        },
      ];
    }

    throw new DocumentDriftError(options.agentKey, maxRetries + 1, []);
  }
}
