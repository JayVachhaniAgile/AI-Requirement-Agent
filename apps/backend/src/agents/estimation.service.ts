import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { LlmService } from '../llm/llm.service';
import { AgentItemArray, buildUserPrompt, ensureItemIds, ensureSummary, formatKnowledge, safeJsonParse } from './agent.utils';
import type { AgentContext, AgentResult, NewKnowledgeItem } from './types';

const Schema = z.object({
  complexityAssessment: z.string().default(''),
  teamComposition: AgentItemArray,
  timeline: AgentItemArray,
  costEstimate: AgentItemArray,
  sprintPlan: AgentItemArray,
  estimationRisks: AgentItemArray,
  estimationSummary: z.string().default(''),
  totalPersonWeeks: z.number().default(0),
});

const SYSTEM = `You are an expert Estimation Agent for a software engineering platform.

Produce JSON with exactly these fields:
- complexityAssessment: string
- teamComposition: [{externalId: "TEAM-001", title, description}] (3-6)
- timeline: [{externalId: "TIME-001", title, description}] (3-6)
- costEstimate: [{externalId: "COST-001", title, description}] (2-5)
- sprintPlan: [{externalId: "SPRINT-001", title, description}] (4-8)
- estimationRisks: [{externalId: "ERISK-001", title, description}] (3-5)
- estimationSummary: string
- totalPersonWeeks: number

Estimate from modules, features, FRs, architecture, security, and QA scope. Be realistic; state assumptions in descriptions.`;

@Injectable()
export class EstimationService {
  constructor(private readonly llm: LlmService) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    const context = formatKnowledge(ctx.knowledgeItems, [
      'MODULE', 'FEATURE', 'FUNCTIONAL_REQUIREMENT', 'SOLUTION_ARCHITECTURE',
      'DATABASE_DESIGN', 'QA_PLAN', 'SECURITY_REPORT', 'MVP_SCOPE', 'SCREEN',
    ]);

    const r = await this.llm.generateStructured([
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: buildUserPrompt(ctx.projectName, ctx.idea, [
          { label: 'Scope & Architecture Context', body: context },
        ], 'Produce project estimation as JSON.'),
      },
    ]);

    const data = Schema.parse(safeJsonParse(r.content));
    const estimationSummary = ensureSummary(data.estimationSummary, `Estimation for ${ctx.projectName}`);
    const complexityAssessment = ensureSummary(data.complexityAssessment, 'Medium complexity based on scope and architecture.');
    const teamComposition = ensureItemIds(data.teamComposition, 'TEAM');
    const timeline = ensureItemIds(data.timeline, 'TIME');
    const costEstimate = ensureItemIds(data.costEstimate, 'COST');
    const sprintPlan = ensureItemIds(data.sprintPlan, 'SPRINT');
    const estimationRisks = ensureItemIds(data.estimationRisks, 'ERISK');
    const totalPersonWeeks = data.totalPersonWeeks > 0 ? data.totalPersonWeeks : 12;

    const knowledgeItems: NewKnowledgeItem[] = [
      {
        type: 'ESTIMATION_REPORT',
        title: 'Estimation Report',
        description: `${estimationSummary}\n\nComplexity:\n${complexityAssessment}\n\nTotal Person-Weeks: ${totalPersonWeeks}`,
        status: 'CONFIRMED',
      },
      ...teamComposition.map((i) => ({ externalId: i.externalId, type: 'TEAM_ROLE', title: i.title, description: i.description, status: 'DRAFT' })),
      ...timeline.map((i) => ({ externalId: i.externalId, type: 'TIMELINE', title: i.title, description: i.description, status: 'DRAFT' })),
      ...costEstimate.map((i) => ({ externalId: i.externalId, type: 'COST_ESTIMATE', title: i.title, description: i.description, status: 'DRAFT' })),
      ...sprintPlan.map((i) => ({ externalId: i.externalId, type: 'SPRINT_PLAN', title: i.title, description: i.description, status: 'DRAFT' })),
      ...estimationRisks.map((i) => ({ externalId: i.externalId, type: 'ESTIMATION_RISK', title: i.title, description: i.description, status: 'DRAFT' })),
    ];

    return {
      success: true,
      agentKey: 'estimation',
      knowledgeItems,
      questions: [],
      warnings: [],
      _tokens: { inputTokens: r.inputTokens, outputTokens: r.outputTokens, model: r.model },
    };
  }
}
