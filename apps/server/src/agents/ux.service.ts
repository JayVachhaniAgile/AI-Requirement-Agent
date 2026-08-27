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
  personas: AgentItemArray,
  userJourneys: AgentItemArray,
  screens: AgentItemArray,
  navigationFlow: z.string().default(''),
  uxGuidelines: AgentItemArray,
  accessibility: AgentItemArray,
  wireframeDescriptions: AgentItemArray,
  uxSummary: z.string().default(''),
});

const UX_DESIGN_SCHEMA = getAgentStructuredSchema('ux-design');


@Injectable()
export class UxService {
  constructor(
    private readonly llm: LlmService,
    private readonly agentRunner: AgentRunnerService,
    @Optional() private readonly skillExecutor?: SkillExecutorService,
  ) {}

  async run(ctx: AgentContext): Promise<AgentResult> {

    const { output: raw, tokens } = await this.agentRunner.run({
      agentKey: 'ux-design',
      messages: buildAgentMessages('ux-design', ctx),
      schema: UX_DESIGN_SCHEMA,
      parse: (content) => Schema.parse(safeJsonParse(content)),
      upstreamItems: ctx.knowledgeItems,
      projectId: ctx.projectId,
    });
    await this.skillExecutor?.recordExecution({
      skillKey: 'ux-design',
      projectId: ctx.projectId,
      model: tokens.model,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      durationMs: 0,
    }).catch(() => undefined);
    await this.skillExecutor?.postPersist({
      projectId: ctx.projectId,
      skillKey: 'ux-design',
    }).catch(() => undefined);
    const navigationFlow = ensureSummary(
      raw.navigationFlow,
      'Users navigate from onboarding → dashboard → core workflows → detail views → settings.',
    );
    const uxSummary = ensureSummary(
      raw.uxSummary,
      `UX specification for ${ctx.projectName} covering personas, journeys, screens, accessibility, and wireframe guidance.`,
    );

    const personas = ensureItemIds(raw.personas, 'UXP');
    const userJourneys = ensureItemIds(raw.userJourneys, 'JOURNEY');
    const screens = ensureItemIds(raw.screens, 'SCR');
    const uxGuidelines = ensureItemIds(raw.uxGuidelines, 'UXG');
    const accessibility = ensureItemIds(raw.accessibility, 'A11Y');
    const wireframeDescriptions = ensureItemIds(raw.wireframeDescriptions, 'WF');

    const knowledgeItems: NewKnowledgeItem[] = [
      {
        type: 'UX_SUMMARY',
        title: 'UX Summary',
        description: `${uxSummary}\n\nNavigation:\n${navigationFlow}`,
        status: 'CONFIRMED',
      },
      ...personas.map((p) => ({
        externalId: p.externalId,
        type: 'UX_PERSONA',
        title: p.title,
        description: p.description,
        status: 'CONFIRMED',
      })),
      ...userJourneys.map((j) => ({
        externalId: j.externalId,
        type: 'USER_JOURNEY',
        title: j.title,
        description: j.description,
        status: 'CONFIRMED',
      })),
      ...screens.map((s) => ({
        externalId: s.externalId,
        type: 'SCREEN',
        title: s.title,
        description: s.description,
        status: 'CONFIRMED',
      })),
      ...uxGuidelines.map((g) => ({
        externalId: g.externalId,
        type: 'UX_GUIDELINE',
        title: g.title,
        description: g.description,
        status: 'CONFIRMED',
      })),
      ...accessibility.map((a) => ({
        externalId: a.externalId,
        type: 'ACCESSIBILITY_REQUIREMENT',
        title: a.title,
        description: a.description,
        status: 'CONFIRMED',
      })),
      ...wireframeDescriptions.map((w) => ({
        externalId: w.externalId,
        type: 'WIREFRAME',
        title: w.title,
        description: w.description,
        status: 'DRAFT',
      })),
    ];

    return {
      success: true,
      agentKey: 'ux',
      knowledgeItems,
      questions: [],
      warnings: [],
      _tokens: tokens,
    };
  }
}
