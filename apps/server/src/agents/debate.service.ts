import { Injectable, Logger, Optional } from '@nestjs/common';
import { z } from 'zod';
import { LlmService } from '../llm/llm.service';
import { AgentRunnerService } from './agent-runner.service';
import { buildAgentMessages } from '../prompts/prompt-builder.service';
import { SkillExecutorService } from '../foundation/skills/skill-executor.service';
import { getAgentStructuredSchema } from '../llm/agent-json-schemas';
import type { AgentContext, AgentResult } from './types';
import { formatConflicts, safeJsonParse } from './agent.utils';
import { RunLogService } from '../run-log/run-log.service';

const ContradictionSchema = z.object({
  contradictions: z
    .array(
      z.object({
        externalId: z.string().optional().default(''),
        conflictingItems: z.array(z.string()).default([]),
        impact: z.string(),
        recommendedResolution: z.string().nullish(),
      }),
    )
    .nullish()
    .default([]),
  assumptionsToValidate: z
    .array(
      z.object({
        externalId: z.string().optional().default(''),
        sourceField: z.string(),
        description: z.string(),
        riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
        validationNeeded: z.string().nullish(),
      }),
    )
    .nullish()
    .default([]),
  debateTranscript: z
    .array(
      z.object({
        perspective: z.string(),
        position: z.string(),
        counterpoint: z.string(),
      }),
    )
    .nullish()
    .default([]),
  debateSummary: z.string().default(''),
  overallReadiness: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  lowConfidenceFlags: z.array(z.object({ field: z.string(), reason: z.string() })).default([]),
});

const DEBATE_SCHEMA = getAgentStructuredSchema('debate');


@Injectable()
export class DebateService {
  private readonly logger = new Logger(DebateService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly agentRunner: AgentRunnerService,
    private readonly runLog: RunLogService,
    @Optional() private readonly skillExecutor?: SkillExecutorService,
  ) {}

  /** Render prior agents' low-confidence flags for the Debate prompt. */
  static formatLowConfidenceContext(
    flags: Array<{ agentKey: string; field: string; reason: string }>,
  ): string {
    if (flags.length === 0) {
      return 'Low-confidence flags raised by prior agents: none.';
    }
    const lines = flags.map((f) => `- [${f.agentKey}] ${f.field}: ${f.reason}`);
    return `Low-confidence flags raised by prior agents (surface each one as an assumption to validate):\n${lines.join('\n')}`;
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    const knowledgeContext = ctx.knowledgeItems;
    const allItems = knowledgeContext
      .map(
        (k) =>
          `[${k.externalId ?? '?'}] ${k.type}: ${k.title}\n  ${k.description ?? ''}\n  Status: ${k.status}  Source: ${k.sourceCategory ?? 'N/A'}`,
      )
      .join('\n\n');

    const lowConfidenceFlags = await this.runLog.listLowConfidenceFlags(ctx.projectId);
    const userMsg =
      `Project: ${ctx.projectName}\n\nAll Knowledge Items:\n${allItems}\n\n` +
      `Original Idea:\n${ctx.idea}\n\n` +
      DebateService.formatLowConfidenceContext(lowConfidenceFlags) +
      formatConflicts(ctx.conflicts);

    const { output: data, tokens } = await this.agentRunner.run({
      agentKey: 'debate',
      messages: [...buildAgentMessages('debate', ctx), { role: 'user', content: userMsg }],
      schema: DEBATE_SCHEMA,
      parse: (content) => ContradictionSchema.parse(safeJsonParse(content)),
      upstreamItems: ctx.knowledgeItems,
      projectId: ctx.projectId,
    });
    await this.skillExecutor?.recordExecution({
      skillKey: 'debate',
      projectId: ctx.projectId,
      model: tokens.model,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      durationMs: 0,
    }).catch(() => undefined);
    await this.skillExecutor?.postPersist({
      projectId: ctx.projectId,
      skillKey: 'debate',
    }).catch(() => undefined);
    const contradictions = data.contradictions ?? [];
    const assumptionsToValidate = data.assumptionsToValidate ?? [];
    const debateTranscript = data.debateTranscript ?? [];

    // Save contradictions as validation issues
    const validationIssues: Array<{
      severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
      category: string;
      problem: string;
      impact?: string;
      evidence?: string;
      recommendedCorrection?: string;
      requiresHumanDecision?: boolean;
      affectedIds?: string[];
      sourceAgent?: string;
    }> = contradictions.map((c) => ({
      severity: 'HIGH' as const,
      category: 'CONTRADICTION',
      problem: `Conflicting items: ${c.conflictingItems.join(', ') || 'unspecified'}`,
      impact: c.impact,
      evidence: c.conflictingItems.join(' vs '),
      recommendedCorrection: c.recommendedResolution ?? 'Requires human review',
      requiresHumanDecision: true,
      affectedIds: c.conflictingItems,
      sourceAgent: 'debate',
    }));

    // Save medium/high-risk assumptions as validation issues too
    for (const a of assumptionsToValidate) {
      if (a.riskLevel === 'HIGH' || a.riskLevel === 'MEDIUM') {
        validationIssues.push({
          severity: (a.riskLevel === 'HIGH' ? 'HIGH' : 'MEDIUM') as 'CRITICAL' | 'HIGH' | 'MEDIUM',
          category: 'ASSUMPTION',
          problem: `Unvalidated assumption: ${a.sourceField}`,
          impact: a.description,
          evidence: a.description,
          recommendedCorrection: a.validationNeeded ?? 'Validate with stakeholder',
          requiresHumanDecision: true,
          sourceAgent: 'debate',
        });
      }
    }

    // Knowledge items from the debate itself
    const knowledgeItems = [
      {
        type: 'DEBATE_SUMMARY',
        title: 'Multi-Agent Debate Summary',
        description: `Readiness: ${data.overallReadiness}\n\n${data.debateSummary}`,
        status: 'CONFIRMED' as const,
        sourceCategory: 'debate' as const,
      },
      ...debateTranscript.map((t) => ({
        type: 'AGENT_POSITION' as const,
        title: `${t.perspective} Position`,
        description: `${t.position}\n\nCounterpoint: ${t.counterpoint}`,
        status: 'CONFIRMED' as const,
        sourceCategory: 'debate' as const,
      })),
      ...assumptionsToValidate
        .filter((a) => a.riskLevel === 'HIGH')
        .map((a) => ({
          type: 'RISKY_ASSUMPTION' as const,
          title: `Assumption on ${a.sourceField}`,
          description: `${a.description}\n\nValidation needed: ${a.validationNeeded ?? 'N/A'}`,
          status: 'DRAFT' as const,
          sourceCategory: 'ai_analysis' as const,
        })),
    ];

    return {
      success: true,
      agentKey: 'debate',
      knowledgeItems,
      validationIssues,
      questions: [],
      warnings: [],
      reasoningTraces: debateTranscript.map(
        (t) => `${t.perspective}: ${t.position} — counterpoint: ${t.counterpoint}`,
      ),
      _tokens: tokens,
    };
  }
}
