import { Injectable, Optional } from '@nestjs/common';
import { z } from 'zod';
import { LlmService } from '../llm/llm.service';
import { AgentRunnerService } from './agent-runner.service';
import { buildAgentMessages } from '../prompts/prompt-builder.service';
import { SkillExecutorService } from '../foundation/skills/skill-executor.service';
import { LegacyAgentAdapterService } from '../foundation/migration/legacy-agent.adapter';
import { getAgentStructuredSchema } from '../llm/agent-json-schemas';
import type { AgentContext, AgentResult, NewKnowledgeItem } from './types';
import { safeJsonParse } from './agent.utils';

const Schema = z.object({
  lowConfidenceFlags: z.array(z.object({ field: z.string(), reason: z.string() })).default([]),
  productVision: z.string(),
  valueProposition: z.string(),
  personas: z.array(
    z.object({
      externalId: z.string().optional().default(''),
      title: z.string(),
      description: z.string(),
    }),
  ),
  modules: z.array(
    z.object({
      externalId: z.string().optional().default(''),
      title: z.string(),
      description: z.string(),
    }),
  ),
  features: z.array(
    z.object({
      externalId: z.string().optional().default(''),
      title: z.string(),
      description: z.string(),
      priority: z.enum(['MUST_HAVE', 'SHOULD_HAVE', 'COULD_HAVE', 'FUTURE']),
      module: z.string(),
      relatedBR: z.string().nullish(),
    }),
  ),
  mvpScope: z.string(),
  successMetrics: z.array(z.object({ title: z.string(), description: z.string() })),
});

const PRODUCT_ANALYSIS_SCHEMA = getAgentStructuredSchema('product-analysis');


@Injectable()
export class ProductManagerService {
  constructor(
    private readonly llm: LlmService,
    private readonly agentRunner: AgentRunnerService,
    @Optional() private readonly skillExecutor?: SkillExecutorService,
    @Optional() private readonly adapter?: LegacyAgentAdapterService,
  ) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    if (this.adapter) {
      return this.adapter.run('product-analysis', ctx, () => this.runLegacy(ctx));
    }
    return this.runLegacy(ctx);
  }

  private async runLegacy(ctx: AgentContext): Promise<AgentResult> {

    const { output: data, tokens } = await this.agentRunner.run({
      agentKey: 'product-analysis',
      messages: buildAgentMessages('product-analysis', ctx),
      schema: PRODUCT_ANALYSIS_SCHEMA,
      parse: (content) => Schema.parse(safeJsonParse(content)),
      upstreamItems: ctx.knowledgeItems,
      projectId: ctx.projectId,
    });
    await this.skillExecutor?.recordExecution({
      skillKey: 'product-analysis',
      projectId: ctx.projectId,
      model: tokens.model,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      durationMs: 0,
    }).catch(() => undefined);
    await this.skillExecutor?.postPersist({
      projectId: ctx.projectId,
      skillKey: 'product-analysis',
    }).catch(() => undefined);
    const knowledgeItems: NewKnowledgeItem[] = [
      {
        type: 'PRODUCT_VISION',
        title: 'Product Vision',
        description: data.productVision,
        status: 'CONFIRMED',
      },
      {
        type: 'VALUE_PROPOSITION',
        title: 'Value Proposition',
        description: data.valueProposition,
        status: 'CONFIRMED',
      },
      ...data.personas.map((p) => ({
        externalId: p.externalId,
        type: 'PERSONA',
        title: p.title,
        description: p.description,
        status: 'CONFIRMED',
      })),
      ...data.modules.map((m) => ({
        externalId: m.externalId,
        type: 'MODULE',
        title: m.title,
        description: m.description,
        status: 'CONFIRMED',
      })),
      ...data.features.map((f) => ({
        externalId: f.externalId,
        type: 'FEATURE',
        title: `[${f.priority}] ${f.title}`,
        description: `${f.description}\nModule: ${f.module}${f.relatedBR ? `\nRelated: ${f.relatedBR}` : ''}`,
        status: 'CONFIRMED',
        relatedIds: f.relatedBR ? [f.relatedBR] : [],
      })),
      {
        type: 'MVP_SCOPE',
        title: 'MVP Scope Definition',
        description: data.mvpScope,
        status: 'CONFIRMED',
      },
      ...data.successMetrics.map((m) => ({
        type: 'SUCCESS_METRIC',
        title: m.title,
        description: m.description,
        status: 'CONFIRMED',
      })),
    ];
    return {
      success: true,
      agentKey: 'product-manager',
      knowledgeItems,
      questions: [],
      warnings: [],
      _tokens: tokens,
    };
  }
}
