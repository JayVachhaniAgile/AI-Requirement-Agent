import { Injectable, Optional } from '@nestjs/common';
import { z } from 'zod';
import { LlmService } from '../llm/llm.service';
import { AgentRunnerService } from './agent-runner.service';
import { buildAgentMessages } from '../prompts/prompt-builder.service';
import { SkillExecutorService } from '../foundation/skills/skill-executor.service';
import { getAgentStructuredSchema } from '../llm/agent-json-schemas';
import {
  AgentItemArray,
  ensureItemIds,
  ensureSummary,
  safeJsonParse,
} from './agent.utils';
import type { AgentContext, AgentResult, NewKnowledgeItem } from './types';

const Schema = z.object({
  lowConfidenceFlags: z.array(z.object({ field: z.string(), reason: z.string() })).default([]),
  complexityAssessment: z.string().default(''),
  teamComposition: AgentItemArray,
  timeline: AgentItemArray,
  costEstimate: AgentItemArray,
  sprintPlan: AgentItemArray,
  estimationRisks: AgentItemArray,
  estimationSummary: z.string().default(''),
  totalPersonWeeks: z.number().default(0),
});

const ESTIMATION_SCHEMA = getAgentStructuredSchema('estimation');


@Injectable()
export class EstimationService {
  constructor(
    private readonly llm: LlmService,
    private readonly agentRunner: AgentRunnerService,
    @Optional() private readonly skillExecutor?: SkillExecutorService,
  ) {}

  async run(ctx: AgentContext): Promise<AgentResult> {

    const { output: data, tokens } = await this.agentRunner.run({
      agentKey: 'estimation',
      messages: buildAgentMessages('estimation', ctx),
      schema: ESTIMATION_SCHEMA,
      parse: (content) => Schema.parse(safeJsonParse(content)),
      upstreamItems: ctx.knowledgeItems,
      projectId: ctx.projectId,
    });
    await this.skillExecutor?.recordExecution({
      skillKey: 'estimation',
      projectId: ctx.projectId,
      model: tokens.model,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      durationMs: 0,
    }).catch(() => undefined);
    await this.skillExecutor?.postPersist({
      projectId: ctx.projectId,
      skillKey: 'estimation',
    }).catch(() => undefined);
    const estimationSummary = ensureSummary(
      data.estimationSummary,
      `Estimation for ${ctx.projectName}`,
    );
    const complexityAssessment = ensureSummary(
      data.complexityAssessment,
      'Medium complexity based on scope and architecture.',
    );
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
      ...teamComposition.map((i) => ({
        externalId: i.externalId,
        type: 'TEAM_ROLE',
        title: i.title,
        description: i.description,
        status: 'DRAFT',
      })),
      ...timeline.map((i) => ({
        externalId: i.externalId,
        type: 'TIMELINE',
        title: i.title,
        description: i.description,
        status: 'DRAFT',
      })),
      ...costEstimate.map((i) => ({
        externalId: i.externalId,
        type: 'COST_ESTIMATE',
        title: i.title,
        description: i.description,
        status: 'DRAFT',
      })),
      ...sprintPlan.map((i) => ({
        externalId: i.externalId,
        type: 'SPRINT_PLAN',
        title: i.title,
        description: i.description,
        status: 'DRAFT',
      })),
      ...estimationRisks.map((i) => ({
        externalId: i.externalId,
        type: 'ESTIMATION_RISK',
        title: i.title,
        description: i.description,
        status: 'DRAFT',
      })),
    ];

    return {
      success: true,
      agentKey: 'estimation',
      knowledgeItems,
      questions: [],
      warnings: [],
      _tokens: tokens,
    };
  }
}
