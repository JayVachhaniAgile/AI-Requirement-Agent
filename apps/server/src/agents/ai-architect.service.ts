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
  aiPipeline: z.string().default(''),
  llmSelection: AgentItemArray,
  promptStrategy: AgentItemArray,
  embeddings: AgentItemArray,
  vectorStore: AgentItemArray,
  memoryContext: AgentItemArray,
  guardrails: AgentItemArray,
  aiArchitectureSummary: z.string().default(''),
});

const AI_ARCHITECTURE_SCHEMA = getAgentStructuredSchema('ai-architecture');


@Injectable()
export class AiArchitectService {
  constructor(
    private readonly llm: LlmService,
    private readonly agentRunner: AgentRunnerService,
    @Optional() private readonly skillExecutor?: SkillExecutorService,
  ) {}

  async run(ctx: AgentContext): Promise<AgentResult> {

    const { output: data, tokens } = await this.agentRunner.run({
      agentKey: 'ai-architecture',
      messages: buildAgentMessages('ai-architecture', ctx),
      schema: AI_ARCHITECTURE_SCHEMA,
      parse: (content) => Schema.parse(safeJsonParse(content)),
      upstreamItems: ctx.knowledgeItems,
      projectId: ctx.projectId,
    });
    await this.skillExecutor?.recordExecution({
      skillKey: 'ai-architecture',
      projectId: ctx.projectId,
      model: tokens.model,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      durationMs: 0,
    }).catch(() => undefined);
    await this.skillExecutor?.postPersist({
      projectId: ctx.projectId,
      skillKey: 'ai-architecture',
    }).catch(() => undefined);
    const aiArchitectureSummary = ensureSummary(
      data.aiArchitectureSummary,
      `AI architecture for ${ctx.projectName}`,
    );
    const aiPipeline = ensureSummary(
      data.aiPipeline,
      'Ingest → extract → enrich → recommend → persist → audit.',
    );
    const llmSelection = ensureItemIds(data.llmSelection, 'LLM');
    const promptStrategy = ensureItemIds(data.promptStrategy, 'PROMPT');
    const embeddings = ensureItemIds(data.embeddings, 'EMB');
    const vectorStore = ensureItemIds(data.vectorStore, 'VEC');
    const memoryContext = ensureItemIds(data.memoryContext, 'MEM');
    const guardrails = ensureItemIds(data.guardrails, 'GRD');

    const knowledgeItems: NewKnowledgeItem[] = [
      {
        type: 'AI_ARCHITECTURE',
        title: 'AI Architecture Summary',
        description: `${aiArchitectureSummary}\n\nPipeline:\n${aiPipeline}`,
        status: 'CONFIRMED',
      },
      ...llmSelection.map((i) => ({
        externalId: i.externalId,
        type: 'LLM_SELECTION',
        title: i.title,
        description: i.description,
        status: 'DRAFT',
      })),
      ...promptStrategy.map((i) => ({
        externalId: i.externalId,
        type: 'PROMPT_STRATEGY',
        title: i.title,
        description: i.description,
        status: 'CONFIRMED',
      })),
      ...embeddings.map((i) => ({
        externalId: i.externalId,
        type: 'EMBEDDING_DESIGN',
        title: i.title,
        description: i.description,
        status: 'CONFIRMED',
      })),
      ...vectorStore.map((i) => ({
        externalId: i.externalId,
        type: 'VECTOR_STORE',
        title: i.title,
        description: i.description,
        status: 'CONFIRMED',
      })),
      ...memoryContext.map((i) => ({
        externalId: i.externalId,
        type: 'AI_MEMORY',
        title: i.title,
        description: i.description,
        status: 'CONFIRMED',
      })),
      ...guardrails.map((i) => ({
        externalId: i.externalId,
        type: 'AI_GUARDRAIL',
        title: i.title,
        description: i.description,
        status: 'CONFIRMED',
      })),
    ];

    return {
      success: true,
      agentKey: 'ai-architect',
      knowledgeItems,
      questions: [],
      warnings: [],
      _tokens: tokens,
    };
  }
}
