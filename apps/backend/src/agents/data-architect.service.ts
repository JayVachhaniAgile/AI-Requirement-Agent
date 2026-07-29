import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { LlmService } from '../llm/llm.service';
import { AgentItemArray, buildUserPrompt, ensureItemIds, ensureSummary, formatKnowledge, safeJsonParse } from './agent.utils';
import type { AgentContext, AgentResult, NewKnowledgeItem } from './types';

const Schema = z.object({
  erOverview: z.string().default(''),
  tables: AgentItemArray,
  relationships: AgentItemArray,
  constraints: AgentItemArray,
  indexes: AgentItemArray,
  dataDictionary: AgentItemArray,
  databaseSummary: z.string().default(''),
});

const SYSTEM = `You are an expert Data Architect for a software engineering platform.

Produce JSON with exactly these fields:
- erOverview: string — concise ER description
- tables: [{externalId: "TBL-001", title, description}] (5-12) — include key columns in description
- relationships: [{externalId: "REL-001", title, description}] (4-10)
- constraints: [{externalId: "DCON-001", title, description}] (3-8)
- indexes: [{externalId: "IDX-001", title, description}] (3-8)
- dataDictionary: [{externalId: "DD-001", title, description}] (6-15) — important fields
- databaseSummary: string

Design for the product features and functional requirements provided. Prefer normalized relational design unless clearly unsuitable.`;

@Injectable()
export class DataArchitectService {
  constructor(private readonly llm: LlmService) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    const context = formatKnowledge(ctx.knowledgeItems, [
      'MODULE', 'FEATURE', 'FUNCTIONAL_REQUIREMENT', 'BUSINESS_RULE',
      'USER_STORY', 'SCREEN', 'BUSINESS_REQUIREMENT',
    ]);

    const r = await this.llm.generateStructured([
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: buildUserPrompt(ctx.projectName, ctx.idea, [
          { label: 'Requirements Context', body: context },
        ], 'Produce database design as JSON.'),
      },
    ]);

    const data = Schema.parse(safeJsonParse(r.content));
    const databaseSummary = ensureSummary(data.databaseSummary, `Database design for ${ctx.projectName}`);
    const erOverview = ensureSummary(data.erOverview, 'Entity-relationship overview for core domain entities.');
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
      ...tables.map((t) => ({ externalId: t.externalId, type: 'DB_TABLE', title: t.title, description: t.description, status: 'CONFIRMED' })),
      ...relationships.map((r) => ({ externalId: r.externalId, type: 'DB_RELATIONSHIP', title: r.title, description: r.description, status: 'CONFIRMED' })),
      ...constraints.map((c) => ({ externalId: c.externalId, type: 'DB_CONSTRAINT', title: c.title, description: c.description, status: 'CONFIRMED' })),
      ...indexes.map((i) => ({ externalId: i.externalId, type: 'DB_INDEX', title: i.title, description: i.description, status: 'CONFIRMED' })),
      ...dataDictionary.map((d) => ({ externalId: d.externalId, type: 'DATA_DICTIONARY', title: d.title, description: d.description, status: 'CONFIRMED' })),
    ];

    return {
      success: true,
      agentKey: 'data-architect',
      knowledgeItems,
      questions: [],
      warnings: [],
      _tokens: { inputTokens: r.inputTokens, outputTokens: r.outputTokens, model: r.model },
    };
  }
}
