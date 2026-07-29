import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { LlmService } from '../llm/llm.service';
import { AgentItemArray, buildUserPrompt, ensureItemIds, ensureSummary, formatKnowledge, withSourceAttribution, EvidenceFields, safeJsonParse } from './agent.utils';
import type { AgentContext, AgentResult, NewKnowledgeItem } from './types';

const Schema = z.object({
  marketOverview: z.string().default(''),
  competitors: z.array(z.object({
    externalId: z.string().default(''), title: z.string().default('Untitled'), description: z.string().default(''),
    ...EvidenceFields,
  })).default([]),
  competitorMatrix: z.string().default(''),
  technologySuggestions: z.array(z.object({
    externalId: z.string().default(''), title: z.string().default('Untitled'), description: z.string().default(''),
    ...EvidenceFields,
  })).default([]),
  apiLandscape: z.array(z.object({
    externalId: z.string().default(''), title: z.string().default('Untitled'), description: z.string().default(''),
    ...EvidenceFields,
  })).default([]),
  complianceNotes: z.array(z.object({
    externalId: z.string().default(''), title: z.string().default('Untitled'), description: z.string().default(''),
    ...EvidenceFields,
  })).default([]),
  industryStandards: z.array(z.object({
    externalId: z.string().default(''), title: z.string().default('Untitled'), description: z.string().default(''),
    ...EvidenceFields,
  })).default([]),
  risks: z.array(z.object({
    externalId: z.string().default(''), title: z.string().default('Untitled'), description: z.string().default(''),
    ...EvidenceFields,
  })).default([]),
  researchSummary: z.string().default(''),
});

const SYSTEM = `You are an expert Research Agent for a software engineering platform.

Produce JSON with exactly these fields:
- marketOverview: string
- competitors: [{externalId: "COMP-001", title, description, evidence?, reasoning?}] (3-6)
- competitorMatrix: string — concise comparison of competitors vs proposed product
- technologySuggestions: [{externalId: "TECH-001", title, description, evidence?, reasoning?}] (4-8)
- apiLandscape: [{externalId: "API-001", title, description}] (2-5) — relevant APIs/integrations
- complianceNotes: [{externalId: "COMPL-001", title, description}] (2-5)
- industryStandards: [{externalId: "STD-001", title, description}] (2-4)
- risks: [{externalId: "RRISK-001", title, description}] (3-5)
- researchSummary: string

For each item, include evidence (source or reference) and reasoning (why this was identified).
Base research on the idea and discovery context. Be practical and specific.`;

@Injectable()
export class ResearchService {
  constructor(private readonly llm: LlmService) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    const discovery = formatKnowledge(ctx.knowledgeItems, [
      'DISCOVERY_SUMMARY', 'BUSINESS_GOAL', 'USER_TYPE', 'CONFIRMED_FACT', 'ASSUMPTION', 'RISK',
    ]);

    const r = await this.llm.generateStructured([
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: buildUserPrompt(ctx.projectName, ctx.idea, [
          { label: 'Discovery Context', body: discovery },
        ], 'Produce market/technology research as JSON. Include evidence and reasoning for each item.'),
      },
    ]);

    const data = Schema.parse(safeJsonParse(r.content));
    const researchSummary = ensureSummary(data.researchSummary, `Research summary for ${ctx.projectName}`);
    const marketOverview = ensureSummary(data.marketOverview, 'Market context and opportunity for the proposed product.');
    const competitorMatrix = ensureSummary(data.competitorMatrix, 'Competitive landscape comparison.');
    const competitors = ensureItemIds(data.competitors, 'COMP');
    const technologySuggestions = ensureItemIds(data.technologySuggestions, 'TECH');
    const apiLandscape = ensureItemIds(data.apiLandscape, 'API');
    const complianceNotes = ensureItemIds(data.complianceNotes, 'COMPL');
    const industryStandards = ensureItemIds(data.industryStandards, 'STD');
    const risks = ensureItemIds(data.risks, 'RRISK');

    const knowledgeItems: NewKnowledgeItem[] = [
      { type: 'RESEARCH_SUMMARY', title: 'Research Summary', description: `${researchSummary}\n\nMarket:\n${marketOverview}\n\nCompetitor Matrix:\n${competitorMatrix}`, status: 'CONFIRMED', sourceCategory: 'ai_analysis', reasoning: 'Compiled research findings from market analysis' },
      ...withSourceAttribution(
        competitors.map((c) => ({ externalId: c.externalId, type: 'COMPETITOR', title: c.title, description: c.description, status: 'CONFIRMED' as const, evidence: c.evidence, reasoning: c.reasoning })),
        { agentKey: 'research', defaultSourceCategory: 'research' },
      ),
      ...withSourceAttribution(
        technologySuggestions.map((t) => ({ externalId: t.externalId, type: 'TECHNOLOGY_SUGGESTION', title: t.title, description: t.description, status: 'DRAFT' as const, evidence: t.evidence, reasoning: t.reasoning })),
        { agentKey: 'research', defaultSourceCategory: 'research' },
      ),
      ...withSourceAttribution(
        apiLandscape.map((a) => ({ externalId: a.externalId, type: 'API_RESEARCH', title: a.title, description: a.description, status: 'CONFIRMED' as const, evidence: a.evidence, reasoning: a.reasoning })),
        { agentKey: 'research', defaultSourceCategory: 'research' },
      ),
      ...withSourceAttribution(
        complianceNotes.map((c) => ({ externalId: c.externalId, type: 'COMPLIANCE_NOTE', title: c.title, description: c.description, status: 'CONFIRMED' as const, evidence: c.evidence, reasoning: c.reasoning })),
        { agentKey: 'research', defaultSourceCategory: 'research' },
      ),
      ...withSourceAttribution(
        industryStandards.map((s) => ({ externalId: s.externalId, type: 'INDUSTRY_STANDARD', title: s.title, description: s.description, status: 'CONFIRMED' as const, evidence: s.evidence, reasoning: s.reasoning })),
        { agentKey: 'research', defaultSourceCategory: 'research' },
      ),
      ...withSourceAttribution(
        risks.map((r) => ({ externalId: r.externalId, type: 'RESEARCH_RISK', title: r.title, description: r.description, status: 'DRAFT' as const, evidence: r.evidence, reasoning: r.reasoning })),
        { agentKey: 'research', defaultSourceCategory: 'research' },
      ),
    ];

    return {
      success: true,
      agentKey: 'research',
      knowledgeItems,
      questions: [],
      warnings: [],
      reasoningTraces: ['Research agent analyzed market landscape, technology stack, and compliance requirements'],
      _tokens: { inputTokens: r.inputTokens, outputTokens: r.outputTokens, model: r.model },
    };
  }
}
