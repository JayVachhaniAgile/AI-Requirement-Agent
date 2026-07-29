import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { LlmService } from '../llm/llm.service';
import type { AgentContext, AgentResult, NewKnowledgeItem } from './types';
import { safeJsonParse } from './agent.utils';

const Schema = z.object({
  productVision: z.string(),
  valueProposition: z.string(),
  personas: z.array(z.object({ externalId: z.string(), title: z.string(), description: z.string() })),
  modules: z.array(z.object({ externalId: z.string(), title: z.string(), description: z.string() })),
  features: z.array(z.object({
    externalId: z.string(), title: z.string(), description: z.string(),
    priority: z.enum(['MUST_HAVE', 'SHOULD_HAVE', 'COULD_HAVE', 'FUTURE']),
    module: z.string(), relatedBR: z.string().nullish(),
  })),
  mvpScope: z.string(),
  successMetrics: z.array(z.object({ title: z.string(), description: z.string() })),
});

const SYSTEM = `You are an expert Product Manager for a software Requirements Engineering system.

Produce a JSON product analysis with these fields:
- productVision: string
- valueProposition: string
- personas: [{externalId: "PER-001", title, description}] (2-4)
- modules: [{externalId: "MOD-001", title, description}] (3-7)
- features: [{externalId: "FEAT-001", title, description, priority: MUST_HAVE|SHOULD_HAVE|COULD_HAVE|FUTURE, module, relatedBR?}] (8-15)
- mvpScope: string
- successMetrics: [{title, description}] (3-5)`;

@Injectable()
export class ProductManagerService {
  constructor(private readonly llm: LlmService) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    const relevant = ctx.knowledgeItems
      .filter((i) => ['BUSINESS_GOAL', 'BUSINESS_REQUIREMENT', 'USER_TYPE', 'STAKEHOLDER', 'SCOPE'].includes(i.type))
      .map((i) => `[${i.type}] ${i.externalId ?? ''} ${i.title}: ${i.description ?? ''}`)
      .join('\n');

    const r = await this.llm.generateStructured([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Project: ${ctx.projectName}\n\nOriginal Idea: ${ctx.idea}\n\nContext:\n${relevant}\n\nProduce product analysis as JSON.` },
    ]);

    const data = Schema.parse(safeJsonParse(r.content));
    const knowledgeItems: NewKnowledgeItem[] = [
      { type: 'PRODUCT_VISION', title: 'Product Vision', description: data.productVision, status: 'CONFIRMED' },
      { type: 'VALUE_PROPOSITION', title: 'Value Proposition', description: data.valueProposition, status: 'CONFIRMED' },
      ...data.personas.map((p) => ({ externalId: p.externalId, type: 'PERSONA', title: p.title, description: p.description, status: 'CONFIRMED' })),
      ...data.modules.map((m) => ({ externalId: m.externalId, type: 'MODULE', title: m.title, description: m.description, status: 'CONFIRMED' })),
      ...data.features.map((f) => ({ externalId: f.externalId, type: 'FEATURE', title: `[${f.priority}] ${f.title}`, description: `${f.description}\nModule: ${f.module}${f.relatedBR ? `\nRelated: ${f.relatedBR}` : ''}`, status: 'CONFIRMED', relatedIds: f.relatedBR ? [f.relatedBR] : [] })),
      { type: 'MVP_SCOPE', title: 'MVP Scope Definition', description: data.mvpScope, status: 'CONFIRMED' },
      ...data.successMetrics.map((m) => ({ type: 'SUCCESS_METRIC', title: m.title, description: m.description, status: 'CONFIRMED' })),
    ];
    return { success: true, agentKey: 'product-manager', knowledgeItems, questions: [], warnings: [], _tokens: { inputTokens: r.inputTokens, outputTokens: r.outputTokens, model: r.model } };
  }
}
