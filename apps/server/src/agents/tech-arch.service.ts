import { Injectable, Optional } from '@nestjs/common';
import { DocumentRunnerService } from './document-runner.service';
import { buildDocumentMessages } from '../prompts/prompt-builder.service';
import { SkillExecutorService } from '../foundation/skills/skill-executor.service';
import type { AgentContext, AgentResult } from './types';

@Injectable()
export class TechArchService {
  constructor(
    private readonly documentRunner: DocumentRunnerService,
    @Optional() private readonly skillExecutor?: SkillExecutorService,
  ) {}

  async run(ctx: AgentContext): Promise<AgentResult> {


    const result = await this.documentRunner.generateDocument({
      agentKey: 'tech-arch',
      projectId: ctx.projectId,
      knowledgeItems: ctx.knowledgeItems,
      messages: buildDocumentMessages('tech-arch', ctx),
    });
    await this.skillExecutor?.recordExecution({
      skillKey: 'tech-arch',
      projectId: ctx.projectId,
      model: result.tokens.model,
      inputTokens: result.tokens.inputTokens,
      outputTokens: result.tokens.outputTokens,
      durationMs: 0,
    }).catch(() => undefined);
    await this.skillExecutor?.postPersist({
      projectId: ctx.projectId,
      skillKey: 'tech-arch',
    }).catch(() => undefined);

    const content = result.content;

    return {
      success: true,
      agentKey: 'tech-arch',
      knowledgeItems: [
        {
          type: 'TECH_ARCH_DOCUMENT',
          title: `${ctx.projectName} — Technical Architecture Document`,
          description: `High-Level Design document. Contains ${content.length} characters.`,
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
