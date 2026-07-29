import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { LlmService } from '../llm/llm.service';
import { AgentItemArray, buildUserPrompt, ensureItemIds, ensureSummary, formatKnowledge } from './agent.utils';
import type { AgentContext, AgentResult, NewKnowledgeItem } from './types';

const Schema = z.object({
  testStrategy: z.string().default(''),
  testPlan: AgentItemArray,
  functionalTests: AgentItemArray,
  regressionTests: AgentItemArray,
  performanceTests: AgentItemArray,
  securityTests: AgentItemArray,
  qaSummary: z.string().default(''),
});

const SYSTEM = `You are an expert QA Agent for a software engineering platform.

Produce JSON with exactly these fields:
- testStrategy: string
- testPlan: [{externalId: "TP-001", title, description}] (3-6)
- functionalTests: [{externalId: "TC-001", title, description}] (8-15) — include steps/expected in description
- regressionTests: [{externalId: "REG-001", title, description}] (3-6)
- performanceTests: [{externalId: "PERF-001", title, description}] (2-5)
- securityTests: [{externalId: "STEST-001", title, description}] (3-6)
- qaSummary: string

Derive tests from functional requirements, user stories, APIs, and security findings. Prefer concrete, testable cases.`;

@Injectable()
export class QaService {
  constructor(private readonly llm: LlmService) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    const context = formatKnowledge(ctx.knowledgeItems, [
      'FUNCTIONAL_REQUIREMENT', 'USER_STORY', 'API_SPEC', 'SCREEN',
      'SECURITY_REPORT', 'OWASP_FINDING', 'FEATURE', 'ACCEPTANCE',
    ]);

    const r = await this.llm.generateStructured([
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: buildUserPrompt(ctx.projectName, ctx.idea, [
          { label: 'Requirements & Security Context', body: context },
        ], 'Produce QA plan and test cases as JSON.'),
      },
    ]);

    const data = Schema.parse(JSON.parse(r.content));
    const qaSummary = ensureSummary(data.qaSummary, `QA plan for ${ctx.projectName}`);
    const testStrategy = ensureSummary(data.testStrategy, 'Risk-based testing across functional, regression, performance, and security layers.');
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
      ...testPlan.map((i) => ({ externalId: i.externalId, type: 'TEST_PLAN_ITEM', title: i.title, description: i.description, status: 'CONFIRMED' })),
      ...functionalTests.map((i) => ({ externalId: i.externalId, type: 'TEST_CASE', title: i.title, description: i.description, status: 'DRAFT' })),
      ...regressionTests.map((i) => ({ externalId: i.externalId, type: 'REGRESSION_TEST', title: i.title, description: i.description, status: 'DRAFT' })),
      ...performanceTests.map((i) => ({ externalId: i.externalId, type: 'PERFORMANCE_TEST', title: i.title, description: i.description, status: 'DRAFT' })),
      ...securityTests.map((i) => ({ externalId: i.externalId, type: 'SECURITY_TEST', title: i.title, description: i.description, status: 'DRAFT' })),
    ];

    return {
      success: true,
      agentKey: 'qa',
      knowledgeItems,
      questions: [],
      warnings: [],
      _tokens: { inputTokens: r.inputTokens, outputTokens: r.outputTokens, model: r.model },
    };
  }
}
