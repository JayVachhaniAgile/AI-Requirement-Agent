import { Injectable, Optional } from '@nestjs/common';
import { DocumentRunnerService } from './document-runner.service';
import { buildDocumentMessages } from '../prompts/prompt-builder.service';
import { SkillExecutorService } from '../foundation/skills/skill-executor.service';
import type { AgentContext, AgentResult } from './types';

@Injectable()
export class FrdService {
  constructor(
    private readonly documentRunner: DocumentRunnerService,
    @Optional() private readonly skillExecutor?: SkillExecutorService,
  ) {}

  async run(ctx: AgentContext): Promise<AgentResult> {


    const result = await this.documentRunner.generateDocument({
      agentKey: 'frd',
      projectId: ctx.projectId,
      knowledgeItems: ctx.knowledgeItems,
      messages: buildDocumentMessages('frd', ctx),
    });
    await this.skillExecutor?.recordExecution({
      skillKey: 'frd',
      projectId: ctx.projectId,
      model: result.tokens.model,
      inputTokens: result.tokens.inputTokens,
      outputTokens: result.tokens.outputTokens,
      durationMs: 0,
    }).catch(() => undefined);
    await this.skillExecutor?.postPersist({
      projectId: ctx.projectId,
      skillKey: 'frd',
    }).catch(() => undefined);

    const content = result.content;

    return {
      success: true,
      agentKey: 'frd',
      knowledgeItems: [
        {
          type: 'FRD_DOCUMENT',
          title: `${ctx.projectName} — Functional Requirements Document`,
          description: `Functional Requirements Document generated from all project knowledge items. Contains ${content.length} characters of structured requirements.`,
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
}
