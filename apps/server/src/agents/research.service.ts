import { Injectable, Optional } from '@nestjs/common';
import { z } from 'zod';
import { LlmService } from '../llm/llm.service';
import { AgentRunnerService } from './agent-runner.service';
import { buildAgentMessages } from '../prompts/prompt-builder.service';
import { SkillExecutorService } from '../foundation/skills/skill-executor.service';
import { LegacyAgentAdapterService } from '../foundation/migration/legacy-agent.adapter';
import { getAgentStructuredSchema } from '../llm/agent-json-schemas';
import {


  ensureItemIds,
  ensureSummary,

  withSourceAttribution,
  EvidenceFields,
  safeJsonParse,
} from './agent.utils';
import type { AgentContext, AgentResult, NewKnowledgeItem } from './types';

const Schema = z.object({
  lowConfidenceFlags: z.array(z.object({ field: z.string(), reason: z.string() })).default([]),
  marketOverview: z.string().default(''),
  competitors: z
    .array(
      z.object({
        externalId: z.string().default(''),
        title: z.string().default('Untitled'),
        description: z.string().default(''),
        ...EvidenceFields,
      }),
    )
    .default([]),
  competitorMatrix: z.string().default(''),
  technologySuggestions: z
    .array(
      z.object({
        externalId: z.string().default(''),
        title: z.string().default('Untitled'),
        description: z.string().default(''),
        ...EvidenceFields,
      }),
    )
    .default([]),
  apiLandscape: z
    .array(
      z.object({
        externalId: z.string().default(''),
        title: z.string().default('Untitled'),
        description: z.string().default(''),
        ...EvidenceFields,
      }),
    )
    .default([]),
  complianceNotes: z
    .array(
      z.object({
        externalId: z.string().default(''),
        title: z.string().default('Untitled'),
        description: z.string().default(''),
        ...EvidenceFields,
      }),
    )
    .default([]),
  industryStandards: z
    .array(
      z.object({
        externalId: z.string().default(''),
        title: z.string().default('Untitled'),
        description: z.string().default(''),
        ...EvidenceFields,
      }),
    )
    .default([]),
  risks: z
    .array(
      z.object({
        externalId: z.string().default(''),
        title: z.string().default('Untitled'),
        description: z.string().default(''),
        ...EvidenceFields,
      }),
    )
    .default([]),
  researchSummary: z.string().default(''),
});

const RESEARCH_SCHEMA = getAgentStructuredSchema('research');


@Injectable()
export class ResearchService {
  constructor(
    private readonly llm: LlmService,
    private readonly agentRunner: AgentRunnerService,
    @Optional() private readonly skillExecutor?: SkillExecutorService,
    @Optional() private readonly adapter?: LegacyAgentAdapterService,
  ) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    if (this.adapter) {
      return this.adapter.run('research', ctx, () => this.runLegacy(ctx));
    }
    return this.runLegacy(ctx);
  }

  private async runLegacy(ctx: AgentContext): Promise<AgentResult> {

    const { output: data, tokens } = await this.agentRunner.run({
      agentKey: 'research',
      messages: buildAgentMessages('research', ctx),
      schema: RESEARCH_SCHEMA,
      parse: (content) => Schema.parse(safeJsonParse(content)),
      upstreamItems: ctx.knowledgeItems,
      projectId: ctx.projectId,
    });
    await this.skillExecutor?.recordExecution({
      skillKey: 'research',
      projectId: ctx.projectId,
      model: tokens.model,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      durationMs: 0,
    }).catch(() => undefined);
    await this.skillExecutor?.postPersist({
      projectId: ctx.projectId,
      skillKey: 'research',
    }).catch(() => undefined);
    const researchSummary = ensureSummary(
      data.researchSummary,
      `Research summary for ${ctx.projectName}`,
    );
    const marketOverview = ensureSummary(
      data.marketOverview,
      'Market context and opportunity for the proposed product.',
    );
    const competitorMatrix = ensureSummary(
      data.competitorMatrix,
      'Competitive landscape comparison.',
    );
    const competitors = ensureItemIds(data.competitors, 'COMP');
    const technologySuggestions = ensureItemIds(data.technologySuggestions, 'TECH');
    const apiLandscape = ensureItemIds(data.apiLandscape, 'API');
    const complianceNotes = ensureItemIds(data.complianceNotes, 'COMPL');
    const industryStandards = ensureItemIds(data.industryStandards, 'STD');
    const risks = ensureItemIds(data.risks, 'RRISK');

    const knowledgeItems: NewKnowledgeItem[] = [
      {
        type: 'RESEARCH_SUMMARY',
        title: 'Research Summary',
        description: `${researchSummary}\n\nMarket:\n${marketOverview}\n\nCompetitor Matrix:\n${competitorMatrix}`,
        status: 'CONFIRMED',
        sourceCategory: 'ai_analysis',
        reasoning: 'Compiled research findings from market analysis',
      },
      ...withSourceAttribution(
        competitors.map((c) => ({
          externalId: c.externalId,
          type: 'COMPETITOR',
          title: c.title,
          description: c.description,
          status: 'CONFIRMED' as const,
          evidence: c.evidence,
          reasoning: c.reasoning,
        })),
        { agentKey: 'research', defaultSourceCategory: 'research' },
      ),
      ...withSourceAttribution(
        technologySuggestions.map((t) => ({
          externalId: t.externalId,
          type: 'TECHNOLOGY_SUGGESTION',
          title: t.title,
          description: t.description,
          status: 'DRAFT' as const,
          evidence: t.evidence,
          reasoning: t.reasoning,
        })),
        { agentKey: 'research', defaultSourceCategory: 'research' },
      ),
      ...withSourceAttribution(
        apiLandscape.map((a) => ({
          externalId: a.externalId,
          type: 'API_RESEARCH',
          title: a.title,
          description: a.description,
          status: 'CONFIRMED' as const,
          evidence: a.evidence,
          reasoning: a.reasoning,
        })),
        { agentKey: 'research', defaultSourceCategory: 'research' },
      ),
      ...withSourceAttribution(
        complianceNotes.map((c) => ({
          externalId: c.externalId,
          type: 'COMPLIANCE_NOTE',
          title: c.title,
          description: c.description,
          status: 'CONFIRMED' as const,
          evidence: c.evidence,
          reasoning: c.reasoning,
        })),
        { agentKey: 'research', defaultSourceCategory: 'research' },
      ),
      ...withSourceAttribution(
        industryStandards.map((s) => ({
          externalId: s.externalId,
          type: 'INDUSTRY_STANDARD',
          title: s.title,
          description: s.description,
          status: 'CONFIRMED' as const,
          evidence: s.evidence,
          reasoning: s.reasoning,
        })),
        { agentKey: 'research', defaultSourceCategory: 'research' },
      ),
      ...withSourceAttribution(
        risks.map((r) => ({
          externalId: r.externalId,
          type: 'RESEARCH_RISK',
          title: r.title,
          description: r.description,
          status: 'DRAFT' as const,
          evidence: r.evidence,
          reasoning: r.reasoning,
        })),
        { agentKey: 'research', defaultSourceCategory: 'research' },
      ),
    ];

    return {
      success: true,
      agentKey: 'research',
      knowledgeItems,
      questions: [],
      warnings: [],
      reasoningTraces: [
        'Research agent analyzed market landscape, technology stack, and compliance requirements',
      ],
      _tokens: tokens,
    };
  }
}
