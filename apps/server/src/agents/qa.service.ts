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
  testStrategy: z.string().default(''),
  testPlan: AgentItemArray,
  functionalTests: AgentItemArray,
  regressionTests: AgentItemArray,
  performanceTests: AgentItemArray,
  securityTests: AgentItemArray,
  qaSummary: z.string().default(''),
});

const QA_PLANNING_SCHEMA = getAgentStructuredSchema('qa-planning');


@Injectable()
export class QaService {
  constructor(
    private readonly llm: LlmService,
    private readonly agentRunner: AgentRunnerService,
    @Optional() private readonly skillExecutor?: SkillExecutorService,
  ) {}

  async run(ctx: AgentContext): Promise<AgentResult> {

    const { output: data, tokens } = await this.agentRunner.run({
      agentKey: 'qa-planning',
      messages: buildAgentMessages('qa-planning', ctx),
      schema: QA_PLANNING_SCHEMA,
      parse: (content) => Schema.parse(safeJsonParse(content)),
      upstreamItems: ctx.knowledgeItems,
      projectId: ctx.projectId,
    });
    await this.skillExecutor?.recordExecution({
      skillKey: 'qa-planning',
      projectId: ctx.projectId,
      model: tokens.model,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      durationMs: 0,
    }).catch(() => undefined);
    await this.skillExecutor?.postPersist({
      projectId: ctx.projectId,
      skillKey: 'qa-planning',
    }).catch(() => undefined);
    const qaSummary = ensureSummary(data.qaSummary, `QA plan for ${ctx.projectName}`);
    const testStrategy = ensureSummary(
      data.testStrategy,
      'Risk-based testing across functional, regression, performance, and security layers.',
    );
    const testPlan = ensureItemIds(data.testPlan, 'TP');
    const functionalTests = ensureItemIds(data.functionalTests, 'TC');
    const regressionTests = ensureItemIds(data.regressionTests, 'REG');
    const performanceTests = ensureItemIds(data.performanceTests, 'PERF');
    const securityTests = ensureItemIds(data.securityTests, 'STEST');

    const knowledgeItems: NewKnowledgeItem[] = [
      {
        type: 'QA_PLAN',
        title: 'QA Plan & Strategy',
        description: `${qaSummary}\n\nStrategy:\n${testStrategy}`,
        status: 'CONFIRMED',
      },
      ...testPlan.map((i) => ({
        externalId: i.externalId,
        type: 'TEST_PLAN_ITEM',
        title: i.title,
        description: i.description,
        status: 'CONFIRMED',
      })),
      ...functionalTests.map((i) => ({
        externalId: i.externalId,
        type: 'TEST_CASE',
        title: i.title,
        description: i.description,
        status: 'DRAFT',
      })),
      ...regressionTests.map((i) => ({
        externalId: i.externalId,
        type: 'REGRESSION_TEST',
        title: i.title,
        description: i.description,
        status: 'DRAFT',
      })),
      ...performanceTests.map((i) => ({
        externalId: i.externalId,
        type: 'PERFORMANCE_TEST',
        title: i.title,
        description: i.description,
        status: 'DRAFT',
      })),
      ...securityTests.map((i) => ({
        externalId: i.externalId,
        type: 'SECURITY_TEST',
        title: i.title,
        description: i.description,
        status: 'DRAFT',
      })),
    ];

    return {
      success: true,
      agentKey: 'qa',
      knowledgeItems,
      questions: [],
      warnings: [],
      _tokens: tokens,
    };
  }
}
