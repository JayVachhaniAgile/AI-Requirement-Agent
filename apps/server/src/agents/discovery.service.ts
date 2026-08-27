import { Injectable, Optional } from '@nestjs/common';
import { z } from 'zod';
import { LlmService } from '../llm/llm.service';
import { AgentRunnerService } from './agent-runner.service';
import { SkillExecutorService } from '../foundation/skills/skill-executor.service';
import { LegacyAgentAdapterService } from '../foundation/migration/legacy-agent.adapter';
import { getAgentStructuredSchema } from '../llm/agent-json-schemas';
import { buildAgentMessages } from '../prompts/prompt-builder.service';
import type { AgentContext, AgentResult, NewKnowledgeItem, NewQuestion } from './types';
import { safeJsonParse } from './agent.utils';

const Schema = z.object({
  lowConfidenceFlags: z.array(z.object({ field: z.string(), reason: z.string() })).default([]),
  ideaInterpretation: z.string(),
  problemStatement: z.string(),
  proposedSolution: z.string(),
  confirmedFacts: z.array(
    z.object({
      externalId: z.string().optional().default(''),
      title: z.string(),
      description: z.string(),
      evidence: z.string().nullish(),
      reasoning: z.string().nullish(),
    }),
  ),
  assumptions: z.array(
    z.object({
      externalId: z.string().optional().default(''),
      title: z.string(),
      description: z.string(),
      reasoning: z.string().nullish(),
    }),
  ),
  businessGoals: z.array(
    z.object({
      externalId: z.string().optional().default(''),
      title: z.string(),
      description: z.string(),
      evidence: z.string().nullish(),
    }),
  ),
  userGoals: z.array(
    z.object({
      externalId: z.string().optional().default(''),
      title: z.string(),
      description: z.string(),
    }),
  ),
  users: z.array(
    z.object({
      externalId: z.string().optional().default(''),
      title: z.string(),
      description: z.string(),
    }),
  ),
  blockingQuestions: z.array(
    z.object({ question: z.string(), context: z.string().nullish(), isBlocking: z.boolean() }),
  ),
  riskFlags: z.array(z.object({ title: z.string(), description: z.string() })),
  initialScope: z.string(),
  reasoningTraces: z.array(z.string()).optional(),
  alternativesConsidered: z.array(z.string()).optional(),
});

const DISCOVERY_SCHEMA = getAgentStructuredSchema('discovery');

@Injectable()
export class DiscoveryService {
  constructor(
    private readonly llm: LlmService,
    private readonly agentRunner: AgentRunnerService,
    @Optional() private readonly skillExecutor?: SkillExecutorService,
    @Optional() private readonly adapter?: LegacyAgentAdapterService,
  ) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    if (this.adapter) {
      return this.adapter.run('discovery', ctx, () => this.runLegacy(ctx));
    }
    return this.runLegacy(ctx);
  }

  private async runLegacy(ctx: AgentContext): Promise<AgentResult> {
    const { output: data, tokens } = await this.agentRunner.run({
      agentKey: 'discovery',
      messages: buildAgentMessages('discovery', ctx),
      schema: DISCOVERY_SCHEMA,
      parse: (content) => Schema.parse(safeJsonParse(content)),
      upstreamItems: ctx.knowledgeItems,
      projectId: ctx.projectId,
    });
    await this.skillExecutor?.recordExecution({
      skillKey: 'discovery',
      projectId: ctx.projectId,
      model: tokens.model,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      durationMs: 0,
    }).catch(() => undefined);


    const knowledgeItems: NewKnowledgeItem[] = [
      ...data.confirmedFacts.map((f) => ({
        externalId: f.externalId,
        type: 'CONFIRMED_FACT',
        title: f.title,
        description: f.description,
        status: 'CONFIRMED',
        sourceCategory: 'prompt' as const,
        evidence: f.evidence,
        reasoning: f.reasoning,
      })),
      ...data.assumptions.map((a) => ({
        externalId: a.externalId,
        type: 'ASSUMPTION',
        title: a.title,
        description: a.description,
        status: 'ASSUMED',
        sourceCategory: 'ai_analysis' as const,
        reasoning: a.reasoning,
      })),
      ...data.businessGoals.map((g) => ({
        externalId: g.externalId,
        type: 'BUSINESS_GOAL',
        title: g.title,
        description: g.description,
        status: 'CONFIRMED',
        sourceCategory: 'prompt' as const,
        evidence: g.evidence,
      })),
      ...data.userGoals.map((g) => ({
        externalId: g.externalId,
        type: 'USER_GOAL',
        title: g.title,
        description: g.description,
        status: 'CONFIRMED',
        sourceCategory: 'ai_analysis' as const,
      })),
      ...data.users.map((u) => ({
        externalId: u.externalId,
        type: 'USER_TYPE',
        title: u.title,
        description: u.description,
        status: 'CONFIRMED',
        sourceCategory: 'ai_analysis' as const,
      })),
      ...data.riskFlags.map((r) => ({
        type: 'RISK',
        title: r.title,
        description: r.description,
        status: 'DRAFT',
        sourceCategory: 'ai_analysis' as const,
      })),
      {
        type: 'DISCOVERY_SUMMARY',
        title: 'Discovery Summary',
        description: `Problem: ${data.problemStatement}\n\nSolution: ${data.proposedSolution}\n\nScope: ${data.initialScope}`,
        status: 'CONFIRMED',
        sourceCategory: 'ai_analysis' as const,
        reasoning: data.ideaInterpretation,
      },
    ];

    const questions: NewQuestion[] = data.blockingQuestions.map((q) => ({
      question: q.question,
      context: q.context,
      isBlocking: q.isBlocking,
    }));

    return {
      success: true,
      agentKey: 'discovery',
      knowledgeItems,
      questions,
      discoveryCheckpoint: {
        ideaInterpretation: data.ideaInterpretation,
        problemStatement: data.problemStatement,
        proposedSolution: data.proposedSolution,
        initialScope: data.initialScope,
        blockingQuestions: data.blockingQuestions.map((q) => ({
          question: q.question,
          context: q.context,
          isBlocking: q.isBlocking,
        })),
      },
      warnings: [],
      reasoningTraces: data.reasoningTraces ?? [],
      alternativesConsidered: data.alternativesConsidered ?? [],
      _tokens: tokens,
    };
  }
}
