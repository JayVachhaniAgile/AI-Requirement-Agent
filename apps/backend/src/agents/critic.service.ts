import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { LlmService } from '../llm/llm.service';
import { compactKnowledgeSummary } from './agent.utils';
import type { AgentContext, AgentResult, NewValidationIssue } from './types';

const IssueSchema = z.object({
  externalId: z.string(),
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

const Schema = z.object({
  validationResult: z.enum(['PASS', 'CONDITIONAL_PASS', 'FAIL']),
  scores: z.record(z.number()),
  issues: z.array(IssueSchema),
  summary: z.string(),
});

const SYSTEM = `You are the Critic and Validation Agent. Find real problems across the full documentation pipeline.

Produce JSON with:
- validationResult: "PASS" | "CONDITIONAL_PASS" | "FAIL"
- scores: object with numeric 0-10 scores for: businessCompleteness, productDefinition, requirementCompleteness, uxCompleteness, architectureQuality, securityPosture, qaCoverage, estimationRealism, consistency, testability, traceability, mvpClarity
- issues: [{externalId: "VAL-001", severity: CRITICAL|HIGH|MEDIUM|LOW, category, sourceAgent, affectedIds: [], problem, evidence, impact, recommendedCorrection, responsibleAgent, requiresHumanDecision: false}] (3-8)
- summary: string (2-4 sentences)

Use the compact knowledge inventory. Prefer high-severity, actionable issues. Keep evidence short.

Categories: MISSING_REQUIREMENT, CONTRADICTION, UNTESTABLE, MISSING_ACCEPTANCE_CRITERIA, BROKEN_TRACEABILITY, SCOPE_CREEP, SECURITY_GAP, UX_GAP, ARCHITECTURE_ISSUE, DATABASE_ISSUE, ESTIMATION_RISK, UNREALISTIC_ASSUMPTION, DUPLICATE, OTHER`;

@Injectable()
export class CriticService {
  constructor(private readonly llm: LlmService) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    const summary = compactKnowledgeSummary(ctx.knowledgeItems, {
      maxChars: 9_000,
      maxDesc: 80,
      maxPerType: 6,
    });

    const r = await this.llm.generateStructured([
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `Project: ${ctx.projectName}\n\nIdea: ${ctx.idea.substring(0, 800)}\n\nCompact Knowledge:\n${summary}\n\nProduce validation report JSON.`,
      },
    ]);

    const data = Schema.parse(JSON.parse(r.content));
    const validationIssues: NewValidationIssue[] = data.issues.map((issue) => ({
      externalId: issue.externalId,
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
      warnings: data.validationResult === 'FAIL' ? ['Validation failed — requirements need rework'] : [],
      _tokens: { inputTokens: r.inputTokens, outputTokens: r.outputTokens, model: r.model },
    };
  }
}
