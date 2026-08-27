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

const ItemSchema = z.object({
  externalId: z.string().optional().default(''),
  title: z.string(),
  description: z.string(),
});
const Schema = z.object({
  lowConfidenceFlags: z.array(z.object({ field: z.string(), reason: z.string() })).default([]),
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

const BUSINESS_ANALYSIS_SCHEMA = getAgentStructuredSchema('business-analysis');


@Injectable()
export class BusinessAnalystService {
  constructor(
    private readonly llm: LlmService,
    private readonly agentRunner: AgentRunnerService,
    @Optional() private readonly skillExecutor?: SkillExecutorService,
    @Optional() private readonly adapter?: LegacyAgentAdapterService,
  ) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    if (this.adapter) {
      return this.adapter.run('business-analysis', ctx, () => this.runLegacy(ctx));
    }
    return this.runLegacy(ctx);
  }

  private async runLegacy(ctx: AgentContext): Promise<AgentResult> {

    const { output: data, tokens } = await this.agentRunner.run({
      agentKey: 'business-analysis',
      messages: buildAgentMessages('business-analysis', ctx),
      schema: BUSINESS_ANALYSIS_SCHEMA,
      parse: (content) => Schema.parse(safeJsonParse(content)),
      upstreamItems: ctx.knowledgeItems,
      projectId: ctx.projectId,
    });
    await this.skillExecutor?.recordExecution({
      skillKey: 'business-analysis',
      projectId: ctx.projectId,
      model: tokens.model,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      durationMs: 0,
    }).catch(() => undefined);
    await this.skillExecutor?.postPersist({
      projectId: ctx.projectId,
      skillKey: 'business-analysis',
    }).catch(() => undefined);
    const knowledgeItems: NewKnowledgeItem[] = [
      ...data.businessObjectives.map((o) => ({
        externalId: o.externalId,
        type: 'BUSINESS_OBJECTIVE',
        title: o.title,
        description: o.description,
        status: 'CONFIRMED',
      })),
      ...data.stakeholders.map((s) => ({
        externalId: s.externalId,
        type: 'STAKEHOLDER',
        title: s.title,
        description: s.description,
        status: 'CONFIRMED',
      })),
      ...data.businessRequirements.map((r) => ({
        externalId: r.externalId,
        type: 'BUSINESS_REQUIREMENT',
        title: r.title,
        description: r.description,
        status: 'CONFIRMED',
      })),
      ...data.businessRules.map((r) => ({
        externalId: r.externalId,
        type: 'BUSINESS_RULE',
        title: r.title,
        description: r.description,
        status: 'CONFIRMED',
      })),
      ...data.constraints.map((c) => ({
        type: 'CONSTRAINT',
        title: c.title,
        description: c.description,
        status: 'CONFIRMED',
      })),
      ...data.risks.map((r) => ({
        externalId: r.externalId,
        type: 'BUSINESS_RISK',
        title: r.title,
        description: r.description,
        status: 'DRAFT',
      })),
      ...data.assumptions.map((a) => ({
        externalId: a.externalId,
        type: 'ASSUMPTION',
        title: a.title,
        description: a.description,
        status: 'ASSUMED',
      })),
      {
        type: 'SCOPE',
        title: 'Project Scope',
        description: `In Scope:\n${data.scope.inScope.join('\n')}\n\nOut of Scope:\n${data.scope.outOfScope.join('\n')}`,
        status: 'CONFIRMED',
      },
      {
        type: 'BA_SUMMARY',
        title: 'Business Analysis Summary',
        description: data.businessProblem,
        status: 'CONFIRMED',
      },
    ];
    return {
      success: true,
      agentKey: 'business-analyst',
      knowledgeItems,
      questions: [],
      warnings: [],
      _tokens: tokens,
    };
  }
}
