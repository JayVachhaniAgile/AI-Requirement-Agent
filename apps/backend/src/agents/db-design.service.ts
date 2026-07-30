import { Injectable } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import type { AgentContext, AgentResult } from './types';

@Injectable()
export class DbDesignService {
  constructor(private readonly llm: LlmService) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    const items = ctx.knowledgeItems
      .filter((i) => [
        'DATA_ENTITY', 'DATA_SCHEMA', 'ER_DIAGRAM',
        'BUSINESS_REQUIREMENT', 'FUNCTIONAL_REQUIREMENT', 'FEATURE', 'MODULE',
      ].includes(i.type))
      .map((i) => `[${i.type}] ${i.title}: ${i.description ?? ''}`)
      .join('\n');

    const prompt = `Project: ${ctx.projectName}\n\nOriginal Idea:\n${ctx.idea}\n\nKnowledge Items:\n${items}\n\nGenerate a complete Database Design document including:\n- ER Diagram (ASCII/Mermaid format)\n- Database Schema (all tables with columns, types, constraints, defaults)\n- Entity Relationships (relationships, cardinalities, foreign keys)\n- Indexes & Performance Optimization\n- Partitioning & Archival Strategy\n- Migration Strategy\n- Data Dictionary\n\nUse proper SQL DDL syntax for schema definitions. Include markdown ER diagrams.`;

    const r = await this.llm.generateText([
      { role: 'system', content: 'You are a Senior Database Architect. Produce a comprehensive Database Design document with ER diagrams (ASCII/Mermaid), full SQL schema, entity relationships, and optimization strategies. Use professional technical writing.' },
      { role: 'user', content: prompt },
    ]);

    return {
      success: true,
      agentKey: 'db-design',
      knowledgeItems: [{
        type: 'DB_DESIGN_DOCUMENT',
        title: `${ctx.projectName} — Database Design Document`,
        description: `Complete Database Design with ER diagrams and schema. Contains ${r.content.length} characters.`,
        status: 'CONFIRMED' as const,
        sourceCategory: 'ai_analysis' as const,
        confidence: 85,
      }],
      questions: [],
      documentContent: r.content,
      warnings: [],
    };
  }
}
