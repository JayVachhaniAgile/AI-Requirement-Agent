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
  erOverview: z.string().default(''),
  tables: AgentItemArray,
  relationships: AgentItemArray,
  constraints: AgentItemArray,
  indexes: AgentItemArray,
  dataDictionary: AgentItemArray,
  databaseSummary: z.string().default(''),
});

const DATA_ARCHITECTURE_SCHEMA = getAgentStructuredSchema('data-architecture');


@Injectable()
export class DataArchitectService {
  constructor(
    private readonly llm: LlmService,
    private readonly agentRunner: AgentRunnerService,
    @Optional() private readonly skillExecutor?: SkillExecutorService,
  ) {}

  async run(ctx: AgentContext): Promise<AgentResult> {

    const { output: data, tokens } = await this.agentRunner.run({
      agentKey: 'data-architecture',
      messages: buildAgentMessages('data-architecture', ctx),
      schema: DATA_ARCHITECTURE_SCHEMA,
      parse: (content) => Schema.parse(safeJsonParse(content)),
      upstreamItems: ctx.knowledgeItems,
      projectId: ctx.projectId,
    });
    await this.skillExecutor?.recordExecution({
      skillKey: 'data-architecture',
      projectId: ctx.projectId,
      model: tokens.model,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      durationMs: 0,
    }).catch(() => undefined);
    await this.skillExecutor?.postPersist({
      projectId: ctx.projectId,
      skillKey: 'data-architecture',
    }).catch(() => undefined);
    const databaseSummary = ensureSummary(
      data.databaseSummary,
      `Database design for ${ctx.projectName}`,
    );
    const erOverview = ensureSummary(
      data.erOverview,
      'Entity-relationship overview for core domain entities.',
    );
    const tables = ensureItemIds(data.tables, 'TBL');
    const relationships = ensureItemIds(data.relationships, 'REL');
    const constraints = ensureItemIds(data.constraints, 'DCON');
    const indexes = ensureItemIds(data.indexes, 'IDX');
    const dataDictionary = ensureItemIds(data.dataDictionary, 'DD');

    const knowledgeItems: NewKnowledgeItem[] = [
      {
        type: 'DATABASE_DESIGN',
        title: 'Database Design Summary',
        description: `${databaseSummary}\n\nER Overview:\n${erOverview}`,
        status: 'CONFIRMED',
      },
      ...tables.map((t) => ({
        externalId: t.externalId,
        type: 'DB_TABLE',
        title: t.title,
        description: t.description,
        status: 'CONFIRMED',
      })),
      ...relationships.map((r) => ({
        externalId: r.externalId,
        type: 'DB_RELATIONSHIP',
        title: r.title,
        description: r.description,
        status: 'CONFIRMED',
      })),
      ...constraints.map((c) => ({
        externalId: c.externalId,
        type: 'DB_CONSTRAINT',
        title: c.title,
        description: c.description,
        status: 'CONFIRMED',
      })),
      ...indexes.map((i) => ({
        externalId: i.externalId,
        type: 'DB_INDEX',
        title: i.title,
        description: i.description,
        status: 'CONFIRMED',
      })),
      ...dataDictionary.map((d) => ({
        externalId: d.externalId,
        type: 'DATA_DICTIONARY',
        title: d.title,
        description: d.description,
        status: 'CONFIRMED',
      })),
    ];

    return {
      success: true,
      agentKey: 'data-architect',
      knowledgeItems,
      questions: [],
      warnings: [],
      _tokens: tokens,
    };
  }
}
