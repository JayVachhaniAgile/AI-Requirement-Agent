import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { LlmService } from '../llm/llm.service';
import { AgentItemArray, buildUserPrompt, ensureItemIds, ensureSummary, formatKnowledge, safeJsonParse } from './agent.utils';
import type { AgentContext, AgentResult, NewKnowledgeItem } from './types';

const Schema = z.object({
  personas: AgentItemArray,
  userJourneys: AgentItemArray,
  screens: AgentItemArray,
  navigationFlow: z.string().default(''),
  uxGuidelines: AgentItemArray,
  accessibility: AgentItemArray,
  wireframeDescriptions: AgentItemArray,
  uxSummary: z.string().default(''),
});

const SYSTEM = `You are an expert UX Agent for a software engineering platform.

Produce JSON with exactly these fields:
- personas: [{externalId: "UXP-001", title, description}] (2-4)
- userJourneys: [{externalId: "JOURNEY-001", title, description}] (3-6)
- screens: [{externalId: "SCR-001", title, description}] (6-12) — screen inventory
- navigationFlow: string — top-level nav and key flows
- uxGuidelines: [{externalId: "UXG-001", title, description}] (4-8)
- accessibility: [{externalId: "A11Y-001", title, description}] (3-6)
- wireframeDescriptions: [{externalId: "WF-001", title, description}] (4-8)
- uxSummary: string

Be concrete and implementation-oriented. Do not invent unrelated product scope.`;

@Injectable()
export class UxService {
  constructor(private readonly llm: LlmService) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    const context = formatKnowledge(ctx.knowledgeItems, [
      'PERSONA', 'USER_TYPE', 'USER_GOAL', 'FEATURE', 'MODULE', 'MVP_SCOPE',
      'FUNCTIONAL_REQUIREMENT', 'USER_STORY', 'PRODUCT_VISION',
    ]);

    const r = await this.llm.generateStructured([
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: buildUserPrompt(ctx.projectName, ctx.idea, [
          { label: 'Product & Requirements Context', body: context },
        ], 'Produce UX specification as JSON.'),
      },
    ]);

    const raw = Schema.parse(safeJsonParse(r.content));
    const navigationFlow = ensureSummary(
      raw.navigationFlow,
      'Users navigate from onboarding → dashboard → core workflows → detail views → settings.',
    );
    const uxSummary = ensureSummary(
      raw.uxSummary,
      `UX specification for ${ctx.projectName} covering personas, journeys, screens, accessibility, and wireframe guidance.`,
    );

    const personas = ensureItemIds(raw.personas, 'UXP');
    const userJourneys = ensureItemIds(raw.userJourneys, 'JOURNEY');
    const screens = ensureItemIds(raw.screens, 'SCR');
    const uxGuidelines = ensureItemIds(raw.uxGuidelines, 'UXG');
    const accessibility = ensureItemIds(raw.accessibility, 'A11Y');
    const wireframeDescriptions = ensureItemIds(raw.wireframeDescriptions, 'WF');

    const knowledgeItems: NewKnowledgeItem[] = [
      {
        type: 'UX_SUMMARY',
        title: 'UX Summary',
        description: `${uxSummary}\n\nNavigation:\n${navigationFlow}`,
        status: 'CONFIRMED',
      },
      ...personas.map((p) => ({ externalId: p.externalId, type: 'UX_PERSONA', title: p.title, description: p.description, status: 'CONFIRMED' })),
      ...userJourneys.map((j) => ({ externalId: j.externalId, type: 'USER_JOURNEY', title: j.title, description: j.description, status: 'CONFIRMED' })),
      ...screens.map((s) => ({ externalId: s.externalId, type: 'SCREEN', title: s.title, description: s.description, status: 'CONFIRMED' })),
      ...uxGuidelines.map((g) => ({ externalId: g.externalId, type: 'UX_GUIDELINE', title: g.title, description: g.description, status: 'CONFIRMED' })),
      ...accessibility.map((a) => ({ externalId: a.externalId, type: 'ACCESSIBILITY_REQUIREMENT', title: a.title, description: a.description, status: 'CONFIRMED' })),
      ...wireframeDescriptions.map((w) => ({ externalId: w.externalId, type: 'WIREFRAME', title: w.title, description: w.description, status: 'DRAFT' })),
    ];

    return {
      success: true,
      agentKey: 'ux',
      knowledgeItems,
      questions: [],
      warnings: [],
      _tokens: { inputTokens: r.inputTokens, outputTokens: r.outputTokens, model: r.model },
    };
  }
}
