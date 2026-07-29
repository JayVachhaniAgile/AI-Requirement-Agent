import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { LlmService } from '../llm/llm.service';
import { AgentItemArray, buildUserPrompt, ensureItemIds, ensureSummary, formatKnowledge } from './agent.utils';
import type { AgentContext, AgentResult, NewKnowledgeItem } from './types';

const Schema = z.object({
  marketOverview: z.string().default(''),
  competitors: AgentItemArray,
  competitorMatrix: z.string().default(''),
  technologySuggestions: AgentItemArray,
  apiLandscape: AgentItemArray,
  complianceNotes: AgentItemArray,
  industryStandards: AgentItemArray,
  risks: AgentItemArray,
  researchSummary: z.string().default(''),
});

const SYSTEM = `You are an expert Research Agent for a software engineering platform.

Produce JSON with exactly these fields:
- marketOverview: string
- competitors: [{externalId: "COMP-001", title, description}] (3-6)
- competitorMatrix: string — concise comparison of competitors vs proposed product
- technologySuggestions: [{externalId: "TECH-001", title, description}] (4-8)
- apiLandscape: [{externalId: "API-001", title, description}] (2-5) — relevant APIs/integrations
- complianceNotes: [{externalId: "COMPL-001", title, description}] (2-5)
- industryStandards: [{externalId: "STD-001", title, description}] (2-4)
- risks: [{externalId: "RRISK-001", title, description}] (3-5)
- researchSummary: string

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
        ], 'Produce market/technology research as JSON.'),
      },
    ]);

    const data = Schema.parse(JSON.parse(r.content));
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
      { type: 'RESEARCH_SUMMARY', title: 'Research Summary', description: `${researchSummary}\n\nMarket:\n${marketOverview}\n\nCompetitor Matrix:\n${competitorMatrix}`, status: 'CONFIRMED' },
      ...competitors.map((c) => ({ externalId: c.externalId, type: 'COMPETITOR', title: c.title, description: c.description, status: 'CONFIRMED' })),
      ...technologySuggestions.map((t) => ({ externalId: t.externalId, type: 'TECHNOLOGY_SUGGESTION', title: t.title, description: t.description, status: 'DRAFT' })),
      ...apiLandscape.map((a) => ({ externalId: a.externalId, type: 'API_RESEARCH', title: a.title, description: a.description, status: 'CONFIRMED' })),
      ...complianceNotes.map((c) => ({ externalId: c.externalId, type: 'COMPLIANCE_NOTE', title: c.title, description: c.description, status: 'CONFIRMED' })),
      ...industryStandards.map((s) => ({ externalId: s.externalId, type: 'INDUSTRY_STANDARD', title: s.title, description: s.description, status: 'CONFIRMED' })),
      ...risks.map((r) => ({ externalId: r.externalId, type: 'RESEARCH_RISK', title: r.title, description: r.description, status: 'DRAFT' })),
    ];

    return {
      success: true,
      agentKey: 'research',
      knowledgeItems,
      questions: [],
      warnings: [],
      _tokens: { inputTokens: r.inputTokens, outputTokens: r.outputTokens, model: r.model },
    };
  }
}
