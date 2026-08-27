import { Injectable, Optional } from '@nestjs/common';
import { DocumentRunnerService } from './document-runner.service';
import { buildDocumentMessages } from '../prompts/prompt-builder.service';
import { SkillExecutorService } from '../foundation/skills/skill-executor.service';
import type { AgentContext, AgentResult } from './types';

@Injectable()
export class ApiSpecService {
  constructor(
    private readonly documentRunner: DocumentRunnerService,
    @Optional() private readonly skillExecutor?: SkillExecutorService,
  ) {}

  async run(ctx: AgentContext): Promise<AgentResult> {


    const result = await this.documentRunner.generateDocument({
      agentKey: 'api-spec',
      projectId: ctx.projectId,
      knowledgeItems: ctx.knowledgeItems,
      messages: buildDocumentMessages('api-spec', ctx),
    });
    await this.skillExecutor?.recordExecution({
      skillKey: 'api-spec',
      projectId: ctx.projectId,
      model: result.tokens.model,
      inputTokens: result.tokens.inputTokens,
      outputTokens: result.tokens.outputTokens,
      durationMs: 0,
    }).catch(() => undefined);
    await this.skillExecutor?.postPersist({
      projectId: ctx.projectId,
      skillKey: 'api-spec',
    }).catch(() => undefined);

    const content = result.content;

    return {
      success: true,
      agentKey: 'api-spec',
      knowledgeItems: [
        {
          type: 'API_SPEC_DOCUMENT',
          title: `${ctx.projectName} — API Specification`,
          description: `Complete OpenAPI-style API Specification. Contains ${content.length} characters.`,
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
