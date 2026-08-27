import { Injectable, Optional } from '@nestjs/common';
import { z } from 'zod';
import { LlmService } from '../llm/llm.service';
import { AgentRunnerService } from './agent-runner.service';
import { buildAgentMessages } from '../prompts/prompt-builder.service';
import { SkillExecutorService } from '../foundation/skills/skill-executor.service';
import { getAgentStructuredSchema } from '../llm/agent-json-schemas';
import { safeJsonParse } from './agent.utils';
import type { AgentContext, AgentResult, NewValidationIssue } from './types';

const IssueSchema = z.object({
  externalId: z.string().nullish(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  category: z.string(),
  sourceAgent: z.string(),
  affectedIds: z.array(z.string()).default([]),
  problem: z.string(),
  evidence: z.string().default(''),
  impact: z.string().default(''),
  recommendedCorrection: z.string().default(''),
  responsibleAgent: z.string().default(''),
  requiresHumanDecision: z.boolean().default(false),
});

const Schema = z
  .object({
    lowConfidenceFlags: z.array(z.object({ field: z.string(), reason: z.string() })).default([]),
    validationResult: z.enum(['PASS', 'CONDITIONAL_PASS', 'FAIL']).default('CONDITIONAL_PASS'),
    scores: z.record(z.number()).default({
      businessCompleteness: 6,
      productDefinition: 6,
      requirementCompleteness: 6,
      uxCompleteness: 6,
      architectureQuality: 6,
      securityPosture: 6,
      qaCoverage: 6,
      estimationRealism: 6,
      consistency: 6,
      testability: 6,
      traceability: 6,
      mvpClarity: 6,
    }),
    issues: z.array(IssueSchema).nullish().transform((v) => v ?? []),
    summary: z.string().nullish().default(''),
  })
  .passthrough();

const VALIDATION_SCHEMA = getAgentStructuredSchema('validation');


@Injectable()
export class CriticService {
  constructor(
    private readonly llm: LlmService,
    private readonly agentRunner: AgentRunnerService,
    @Optional() private readonly skillExecutor?: SkillExecutorService,
  ) {}

  async run(ctx: AgentContext): Promise<AgentResult> {

    const { output: raw, tokens } = await this.agentRunner.run({
      agentKey: 'validation',
      messages: buildAgentMessages('validation', ctx),
      schema: VALIDATION_SCHEMA,
      parse: (content) => safeJsonParse(content),
      upstreamItems: ctx.knowledgeItems,
      projectId: ctx.projectId,
    });
    await this.skillExecutor?.recordExecution({
      skillKey: 'validation',
      projectId: ctx.projectId,
      model: tokens.model,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      durationMs: 0,
    }).catch(() => undefined);
    await this.skillExecutor?.postPersist({
      projectId: ctx.projectId,
      skillKey: 'validation',
    }).catch(() => undefined);
    // Normalize alternative field names from LLM
    if (raw.result && !raw.validationResult) raw.validationResult = raw.result;
    if (raw.score && !raw.scores) raw.scores = raw.score;
    const data = Schema.parse(raw);
    const validationIssues: NewValidationIssue[] = data.issues.map((issue) => ({
      externalId:
        issue.externalId ?? `VAL-${String(data.issues.indexOf(issue) + 1).padStart(3, '0')}`,
      severity: issue.severity,
      category: issue.category,
      sourceAgent: issue.sourceAgent,
      affectedIds: issue.affectedIds,
      problem: issue.problem,
      evidence: issue.evidence,
      impact: issue.impact,
      recommendedCorrection: issue.recommendedCorrection,
      responsibleAgent: issue.responsibleAgent,
      requiresHumanDecision: issue.requiresHumanDecision,
    }));

    return {
      success: true,
      agentKey: 'critic',
      knowledgeItems: [
        {
          type: 'VALIDATION_SCORES',
          title: `Validation: ${data.validationResult}`,
          status: 'VALIDATED',
          description: `Result: ${data.validationResult}\n\nScores:\n${Object.entries(data.scores)
            .map(([k, v]) => `${k}: ${v}/10`)
            .join('\n')}\n\nSummary: ${data.summary}`,
        },
      ],
      questions: [],
      validationIssues,
      warnings:
        data.validationResult === 'FAIL' ? ['Validation failed — requirements need rework'] : [],
      _tokens: tokens,
    };
  }
}
