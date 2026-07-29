import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { LlmService } from '../llm/llm.service';
import type { AgentContext, AgentResult, NewKnowledgeItem } from './types';

const ItemSchema = z.object({ externalId: z.string(), title: z.string(), description: z.string() });
const Schema = z.object({
  businessProblem: z.string(),
  businessObjectives: z.array(ItemSchema),
  stakeholders: z.array(ItemSchema),
  businessRequirements: z.array(ItemSchema),
  businessRules: z.array(ItemSchema),
  constraints: z.array(z.object({ title: z.string(), description: z.string() })),
  risks: z.array(ItemSchema),
  assumptions: z.array(ItemSchema),
  scope: z.object({ inScope: z.array(z.string()), outOfScope: z.array(z.string()) }),
});

const SYSTEM = `You are an expert Business Analyst for a software Requirements Engineering system.

Produce a JSON business analysis with exactly these fields:
- businessProblem: string
- businessObjectives: [{externalId: "BO-001", title, description}] (3-5)
- stakeholders: [{externalId: "STK-001", title, description}] (3-6)
- businessRequirements: [{externalId: "BR-001", title, description}] (5-10)
- businessRules: [{externalId: "RULE-001", title, description}] (3-7)
- constraints: [{title, description}] (2-5)
- risks: [{externalId: "RISK-001", title, description}] (3-6)
- assumptions: [{externalId: "ASM-B-001", title, description}] (3-5)
- scope: { inScope: string[], outOfScope: string[] }`;

@Injectable()
export class BusinessAnalystService {
  constructor(private readonly llm: LlmService) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    const existingItems = ctx.knowledgeItems
      .filter((i) => ['BUSINESS_GOAL', 'CONFIRMED_FACT', 'USER_TYPE', 'DISCOVERY_SUMMARY'].includes(i.type))
      .map((i) => `[${i.type}] ${i.externalId ?? ''} ${i.title}: ${i.description ?? ''}`)
      .join('\n');

    const r = await this.llm.generateStructured([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Project: ${ctx.projectName}\n\nOriginal Idea: ${ctx.idea}\n\nDiscovery Results:\n${existingItems}\n\nProduce a thorough business analysis as JSON.` },
    ]);

    const data = Schema.parse(JSON.parse(r.content));
    const knowledgeItems: NewKnowledgeItem[] = [
      ...data.businessObjectives.map((o) => ({ externalId: o.externalId, type: 'BUSINESS_OBJECTIVE', title: o.title, description: o.description, status: 'CONFIRMED' })),
      ...data.stakeholders.map((s) => ({ externalId: s.externalId, type: 'STAKEHOLDER', title: s.title, description: s.description, status: 'CONFIRMED' })),
      ...data.businessRequirements.map((r) => ({ externalId: r.externalId, type: 'BUSINESS_REQUIREMENT', title: r.title, description: r.description, status: 'CONFIRMED' })),
      ...data.businessRules.map((r) => ({ externalId: r.externalId, type: 'BUSINESS_RULE', title: r.title, description: r.description, status: 'CONFIRMED' })),
      ...data.constraints.map((c) => ({ type: 'CONSTRAINT', title: c.title, description: c.description, status: 'CONFIRMED' })),
      ...data.risks.map((r) => ({ externalId: r.externalId, type: 'BUSINESS_RISK', title: r.title, description: r.description, status: 'DRAFT' })),
      ...data.assumptions.map((a) => ({ externalId: a.externalId, type: 'ASSUMPTION', title: a.title, description: a.description, status: 'ASSUMED' })),
      { type: 'SCOPE', title: 'Project Scope', description: `In Scope:\n${data.scope.inScope.join('\n')}\n\nOut of Scope:\n${data.scope.outOfScope.join('\n')}`, status: 'CONFIRMED' },
      { type: 'BA_SUMMARY', title: 'Business Analysis Summary', description: data.businessProblem, status: 'CONFIRMED' },
    ];
    return { success: true, agentKey: 'business-analyst', knowledgeItems, questions: [], warnings: [], _tokens: { inputTokens: r.inputTokens, outputTokens: r.outputTokens, model: r.model } };
  }
}
