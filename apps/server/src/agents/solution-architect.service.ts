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
  systemArchitecture: z.string().default(''),
  components: AgentItemArray,
  apis: AgentItemArray,
  queuesEvents: AgentItemArray,
  infrastructure: AgentItemArray,
  deployment: AgentItemArray,
  loggingMonitoring: AgentItemArray,
  technicalSummary: z.string().default(''),
});

const SOLUTION_ARCHITECTURE_SCHEMA = getAgentStructuredSchema('solution-architecture');


@Injectable()
export class SolutionArchitectService {
  constructor(
    private readonly llm: LlmService,
    private readonly agentRunner: AgentRunnerService,
    @Optional() private readonly skillExecutor?: SkillExecutorService,
  ) {}

  async run(ctx: AgentContext): Promise<AgentResult> {

    const { output: data, tokens } = await this.agentRunner.run({
      agentKey: 'solution-architecture',
      messages: buildAgentMessages('solution-architecture', ctx),
      schema: SOLUTION_ARCHITECTURE_SCHEMA,
      parse: (content) => Schema.parse(safeJsonParse(content)),
      upstreamItems: ctx.knowledgeItems,
      projectId: ctx.projectId,
    });
    await this.skillExecutor?.recordExecution({
      skillKey: 'solution-architecture',
      projectId: ctx.projectId,
      model: tokens.model,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      durationMs: 0,
    }).catch(() => undefined);
    await this.skillExecutor?.postPersist({
      projectId: ctx.projectId,
      skillKey: 'solution-architecture',
    }).catch(() => undefined);
    const technicalSummary = ensureSummary(
      data.technicalSummary,
      `Technical architecture for ${ctx.projectName}`,
    );
    const systemArchitecture = ensureSummary(
      data.systemArchitecture,
      'Modular services with API gateway, workers, and shared data layer.',
    );
    const components = ensureItemIds(data.components, 'CMP');
    const apis = ensureItemIds(data.apis, 'API-SPEC');
    const queuesEvents = ensureItemIds(data.queuesEvents, 'EVT');
    const infrastructure = ensureItemIds(data.infrastructure, 'INF');
    const deployment = ensureItemIds(data.deployment, 'DEP');
    const loggingMonitoring = ensureItemIds(data.loggingMonitoring, 'OBS');

    const knowledgeItems: NewKnowledgeItem[] = [
      {
        type: 'SOLUTION_ARCHITECTURE',
        title: 'Solution Architecture Summary',
        description: `${technicalSummary}\n\nSystem Architecture:\n${systemArchitecture}`,
        status: 'CONFIRMED',
      },
      ...components.map((i) => ({
        externalId: i.externalId,
        type: 'SYSTEM_COMPONENT',
        title: i.title,
        description: i.description,
        status: 'CONFIRMED',
      })),
      ...apis.map((i) => ({
        externalId: i.externalId,
        type: 'API_SPEC',
        title: i.title,
        description: i.description,
        status: 'CONFIRMED',
      })),
      ...queuesEvents.map((i) => ({
        externalId: i.externalId,
        type: 'EVENT_FLOW',
        title: i.title,
        description: i.description,
        status: 'CONFIRMED',
      })),
      ...infrastructure.map((i) => ({
        externalId: i.externalId,
        type: 'INFRASTRUCTURE',
        title: i.title,
        description: i.description,
        status: 'CONFIRMED',
      })),
      ...deployment.map((i) => ({
        externalId: i.externalId,
        type: 'DEPLOYMENT',
        title: i.title,
        description: i.description,
        status: 'CONFIRMED',
      })),
      ...loggingMonitoring.map((i) => ({
        externalId: i.externalId,
        type: 'OBSERVABILITY',
        title: i.title,
        description: i.description,
        status: 'CONFIRMED',
      })),
    ];

    return {
      success: true,
      agentKey: 'solution-architect',
      knowledgeItems,
      questions: [],
      warnings: [],
      _tokens: tokens,
    };
  }
}
