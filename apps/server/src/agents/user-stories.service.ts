import { Injectable, Optional } from '@nestjs/common';
import { DocumentRunnerService } from './document-runner.service';
import { buildDocumentMessages } from '../prompts/prompt-builder.service';
import { SkillExecutorService } from '../foundation/skills/skill-executor.service';
import { DOCUMENT_ID_PATTERNS, extractDocumentIds } from '../validation/document-drift';
import type { AgentContext, AgentResult } from './types';

@Injectable()
export class UserStoriesService {
  constructor(
    private readonly documentRunner: DocumentRunnerService,
    @Optional() private readonly skillExecutor?: SkillExecutorService,
  ) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    const requiredSourceItems = ctx.knowledgeItems
      .filter((i) => i.type === 'USER_STORY')
      .map((i) => ({
        id: i.externalId ?? '',
        title: i.title,
        description: i.description,
      }))
      .filter((i) => i.id);

    const result = await this.documentRunner.generateDocument({
      agentKey: 'user-stories',
      projectId: ctx.projectId,
      knowledgeItems: ctx.knowledgeItems,
      messages: buildDocumentMessages('user-stories', ctx),
    });
    await this.skillExecutor?.recordExecution({
      skillKey: 'user-stories',
      projectId: ctx.projectId,
      model: result.tokens.model,
      inputTokens: result.tokens.inputTokens,
      outputTokens: result.tokens.outputTokens,
      durationMs: 0,
    }).catch(() => undefined);
    await this.skillExecutor?.postPersist({
      projectId: ctx.projectId,
      skillKey: 'user-stories',
    }).catch(() => undefined);
    const content = this.attachMissingItemsSection(result.content, requiredSourceItems);

    return {
      success: true,
      agentKey: 'user-stories',
      knowledgeItems: [
        {
          type: 'USER_STORIES_DOCUMENT',
          title: `${ctx.projectName} — User Stories & Acceptance Criteria`,
          description: `User Stories backlog with acceptance criteria. Contains ${content.length} characters.`,
          status: 'CONFIRMED' as const,
          sourceCategory: 'ai_analysis' as const,
          confidence: 85,
        },
      ],
      questions: [],
      documentContent: content,
      warnings: [],
    };
  }

  private attachMissingItemsSection(
    content: string,
    requiredItems: Array<{ id: string; title?: string; description?: string | null }>,
  ): string {
    const existingIds = extractDocumentIds(content, DOCUMENT_ID_PATTERNS['user-stories']);
    const missingItems = requiredItems.filter((item) => !existingIds.has(item.id));

    if (missingItems.length === 0) {
      return content;
    }

    const section = [
      '',
      '## Missing / Uncovered Items',
      '',
      'The following source items were not explicitly included in the generated document body. They are listed here for traceability and follow-up.',
      '',
      ...missingItems.map((item) => {
        const title = item.title ? `: ${item.title}` : '';
        const description = item.description ? ` — ${item.description}` : '';
        return `- **${item.id}**${title}${description}`;
      }),
      '',
    ].join('\n');

    return `${content.trimEnd()}${section}`;
  }
}
