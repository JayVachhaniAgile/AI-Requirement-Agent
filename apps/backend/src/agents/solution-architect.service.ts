import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { LlmService } from '../llm/llm.service';
import { AgentItemArray, buildUserPrompt, ensureItemIds, ensureSummary, formatKnowledge, safeJsonParse } from './agent.utils';
import type { AgentContext, AgentResult, NewKnowledgeItem } from './types';

const Schema = z.object({
  systemArchitecture: z.string().default(''),
  components: AgentItemArray,
  apis: AgentItemArray,
  queuesEvents: AgentItemArray,
  infrastructure: AgentItemArray,
  deployment: AgentItemArray,
  loggingMonitoring: AgentItemArray,
  technicalSummary: z.string().default(''),
});

const SYSTEM = `You are an expert Solution Architect for a software engineering platform.

Produce JSON with exactly these fields:
- systemArchitecture: string — high-level architecture narrative
- components: [{externalId: "CMP-001", title, description}] (5-10)
- apis: [{externalId: "API-SPEC-001", title, description}] (5-12) — key endpoints/contracts
- queuesEvents: [{externalId: "EVT-001", title, description}] (2-6)
- infrastructure: [{externalId: "INF-001", title, description}] (3-6)
- deployment: [{externalId: "DEP-001", title, description}] (2-5)
- loggingMonitoring: [{externalId: "OBS-001", title, description}] (3-6)
- technicalSummary: string

Align with database design, UX screens, AI architecture, and functional requirements. Prefer modular, scalable NestJS + React + Postgres style unless context clearly requires otherwise.`;

@Injectable()
export class SolutionArchitectService {
  constructor(private readonly llm: LlmService) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    const context = formatKnowledge(ctx.knowledgeItems, [
      'MODULE', 'FEATURE', 'FUNCTIONAL_REQUIREMENT', 'DATABASE_DESIGN', 'DB_TABLE',
      'AI_ARCHITECTURE', 'SCREEN', 'TECHNOLOGY_SUGGESTION', 'API_RESEARCH',
    ]);

    const r = await this.llm.generateStructured([
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: buildUserPrompt(ctx.projectName, ctx.idea, [
          { label: 'Architecture Inputs', body: context },
        ], 'Produce solution architecture as JSON.'),
      },
    ]);

    const data = Schema.parse(safeJsonParse(r.content));
    const technicalSummary = ensureSummary(data.technicalSummary, `Technical architecture for ${ctx.projectName}`);
    const systemArchitecture = ensureSummary(data.systemArchitecture, 'Modular services with API gateway, workers, and shared data layer.');
    const components = ensureItemIds(data.components, 'CMP');
    const apis = ensureItemIds(data.apis, 'API-SPEC');
    const queuesEvents = ensureItemIds(data.queuesEvents, 'EVT');
    const infrastructure = ensureItemIds(data.infrastructure, 'INF');
    const deployment = ensureItemIds(data.deployment, 'DEP');
    const loggingMonitoring = ensureItemIds(data.loggingMonitoring, 'OBS');

    const knowledgeItems: NewKnowledgeItem[] = [
      {
        type: 'SOLUTION_ARCHITECTURE',
        title: 'Solution Architecture Summary',
        description: `${technicalSummary}\n\nSystem Architecture:\n${systemArchitecture}`,
        status: 'CONFIRMED',
      },
      ...components.map((i) => ({ externalId: i.externalId, type: 'SYSTEM_COMPONENT', title: i.title, description: i.description, status: 'CONFIRMED' })),
      ...apis.map((i) => ({ externalId: i.externalId, type: 'API_SPEC', title: i.title, description: i.description, status: 'CONFIRMED' })),
      ...queuesEvents.map((i) => ({ externalId: i.externalId, type: 'EVENT_FLOW', title: i.title, description: i.description, status: 'CONFIRMED' })),
      ...infrastructure.map((i) => ({ externalId: i.externalId, type: 'INFRASTRUCTURE', title: i.title, description: i.description, status: 'CONFIRMED' })),
      ...deployment.map((i) => ({ externalId: i.externalId, type: 'DEPLOYMENT', title: i.title, description: i.description, status: 'CONFIRMED' })),
      ...loggingMonitoring.map((i) => ({ externalId: i.externalId, type: 'OBSERVABILITY', title: i.title, description: i.description, status: 'CONFIRMED' })),
    ];

    return {
      success: true,
      agentKey: 'solution-architect',
      knowledgeItems,
      questions: [],
      warnings: [],
      _tokens: { inputTokens: r.inputTokens, outputTokens: r.outputTokens, model: r.model },
    };
  }
}
