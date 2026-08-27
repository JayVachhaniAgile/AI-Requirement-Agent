import { Injectable, Optional } from '@nestjs/common';
import { DocumentRunnerService } from './document-runner.service';
import { buildDocumentMessages } from '../prompts/prompt-builder.service';
import { SkillExecutorService } from '../foundation/skills/skill-executor.service';
import { DOCUMENT_ID_PATTERNS, extractDocumentIds } from '../validation/document-drift';
import type { AgentContext, AgentResult } from './types';

@Injectable()
export class SowService {
  constructor(
    private readonly documentRunner: DocumentRunnerService,
    @Optional() private readonly skillExecutor?: SkillExecutorService,
  ) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    const modules = ctx.knowledgeItems
      .filter((i) => i.type === 'MODULE')
      .map((i) => ({
        id: i.externalId,
        title: i.title,
        description: i.description,
      }));

    const features = ctx.knowledgeItems
      .filter((i) => i.type === 'FEATURE')
      .map((i) => ({
        id: i.externalId,
        title: i.title,
        description: i.description,
      }));

    const assumptions = ctx.knowledgeItems
      .filter((i) => ['ASSUMPTION', 'CONFIRMED_FACT'].includes(i.type))
      .map((i) => ({
        id: i.externalId,
        type: i.type,
        title: i.title,
        description: i.description,
      }));

    const requiredSourceItems = ctx.knowledgeItems
      .filter((i) => i.type === 'MODULE' || i.type === 'FEATURE')
      .map((i) => ({
        id: i.externalId ?? '',
        title: i.title,
        description: i.description,
      }))
      .filter((i) => i.id);

    const requiredSourceIds = requiredSourceItems.map((i) => i.id);

    const chunkSize = 6;
    let finalResult: Awaited<ReturnType<typeof this.documentRunner.generateDocument>>;

    if (features.length <= chunkSize) {
      const singleMessages = buildDocumentMessages('sow', {
        projectName: ctx.projectName,
        idea: ctx.idea,
        knowledgeItems: ctx.knowledgeItems,
        sowModules: modules.map((m) => `${m.id ?? ''}: ${m.title}: ${m.description ?? ''}`).join('\n'),
        sowFeatures: features.map((f) => `${f.id ?? ''}: ${f.title}: ${f.description ?? ''}`).join('\n'),
        sowAssumptions: assumptions.map((a) => `${a.id ?? ''}: ${a.type}: ${a.title}: ${a.description ?? ''}`).join('\n'),
        sowRequiredSourceIds: requiredSourceIds.join(', '),
      });
      finalResult = await this.documentRunner.generateDocument({
        agentKey: 'sow',
        projectId: ctx.projectId,
        knowledgeItems: ctx.knowledgeItems,
        requiredSourceIds,
        messages: singleMessages,
      });
    } else {
      const featureChunks: Array<typeof features> = [];
      for (let i = 0; i < features.length; i += chunkSize) {
        featureChunks.push(features.slice(i, i + chunkSize));
      }

      const chunkOutputs: string[] = [];
      for (const chunk of featureChunks) {
        const chunkMessages = buildDocumentMessages('sow-chunk', {
          projectName: ctx.projectName,
          idea: ctx.idea,
          knowledgeItems: ctx.knowledgeItems,
          sowModules: modules.map((m) => `${m.id ?? ''}: ${m.title}: ${m.description ?? ''}`).join('\n'),
          sowFeatures: chunk.map((f) => `${f.id ?? ''}: ${f.title}: ${f.description ?? ''}`).join('\n'),
          sowAssumptions: assumptions.map((a) => `${a.id ?? ''}: ${a.type}: ${a.title}: ${a.description ?? ''}`).join('\n'),
          sowRequiredSourceIds: chunk.map((f) => f.id ?? '').join(', '),
        });
        const result = await this.documentRunner.generateDocument({
          agentKey: 'sow',
          projectId: ctx.projectId,
          knowledgeItems: ctx.knowledgeItems,
          requiredSourceIds: chunk.map((f) => f.id ?? '').filter(Boolean),
          messages: chunkMessages,
        });
        chunkOutputs.push(result.content);
      }

      const mergeMessages = buildDocumentMessages('sow-merge', {
        projectName: ctx.projectName,
        idea: ctx.idea,
        knowledgeItems: ctx.knowledgeItems,
        sowModules: modules.map((m) => `${m.id ?? ''}: ${m.title}: ${m.description ?? ''}`).join('\n'),
        sowAssumptions: assumptions.map((a) => `${a.id ?? ''}: ${a.type}: ${a.title}: ${a.description ?? ''}`).join('\n'),
        sowDraftEntries: chunkOutputs.join('\n\n---\n\n'),
        sowRequiredSourceIds: requiredSourceIds.join(', '),
      });
      finalResult = await this.documentRunner.generateDocument({
        agentKey: 'sow',
        projectId: ctx.projectId,
        knowledgeItems: ctx.knowledgeItems,
        requiredSourceIds: requiredSourceIds,
        messages: mergeMessages,
      });
    }
    const totalTokens = finalResult.tokens;
    await this.skillExecutor?.recordExecution({
      skillKey: 'sow',
      projectId: ctx.projectId,
      model: totalTokens.model,
      inputTokens: totalTokens.inputTokens,
      outputTokens: totalTokens.outputTokens,
      durationMs: 0,
    }).catch(() => undefined);
    await this.skillExecutor?.postPersist({
      projectId: ctx.projectId,
      skillKey: 'sow',
    }).catch(() => undefined);
    const content = this.attachMissingItemsSection(finalResult.content, requiredSourceItems);

    return {
      success: true,
      agentKey: 'sow',
      knowledgeItems: [
        {
          type: 'SOW_DOCUMENT',
          title: `${ctx.projectName} — Scope of Work`,
          description: `Client-facing Scope of Work covering every feature. Contains ${content.length} characters.`,
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
    const existingIds = extractDocumentIds(content, DOCUMENT_ID_PATTERNS.sow);
    const missingItems = requiredItems.filter((item) => !existingIds.has(item.id));

    if (missingItems.length === 0) {
      return content;
    }

    const section = [
      '',
      '## Missing / Uncovered Items',
      '',
      'The following source items were not explicitly included in the generated SOW body. They are listed here for traceability and follow-up.',
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
