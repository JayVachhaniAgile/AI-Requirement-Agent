import { Injectable } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import type { AgentContext, AgentResult } from './types';

@Injectable()
export class FrdService {
  constructor(private readonly llm: LlmService) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    const items = ctx.knowledgeItems.map((i) =>
      `[${i.type}] ${i.externalId ?? ''} ${i.title}: ${i.description ?? ''}`
    ).join('\n');

    const prompt = `Project: ${ctx.projectName}\n\nOriginal Idea:\n${ctx.idea}\n\nAll Knowledge Items:\n${items}\n\nGenerate a complete Functional Requirements Document (FRD) covering:\n- Overview & Business Context\n- Functional Requirements (logically grouped by module/feature)\n- Business Rules & Validations\n- Data Flow Descriptions\n- User Interface Requirements\n- Integration & External System Requirements\n- Performance & Scaling Requirements\n- Security & Compliance Requirements\n\nUse clear section headings, numbered requirements, and professional technical writing.`;

    const r = await this.llm.generateText([
      { role: 'system', content: 'You are a senior Technical Business Analyst. Produce a comprehensive Functional Requirements Document with clear sections, numbered requirements (FR-001, FR-002...), and professional formatting. Use markdown.' },
      { role: 'user', content: prompt },
    ]);

    return {
      success: true,
      agentKey: 'frd',
      knowledgeItems: [{
        type: 'FRD_DOCUMENT',
        title: `${ctx.projectName} — Functional Requirements Document`,
        description: `Functional Requirements Document generated from all project knowledge items. Contains ${r.content.length} characters of structured requirements.`,
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
