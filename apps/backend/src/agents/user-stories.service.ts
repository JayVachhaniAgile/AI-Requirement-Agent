import { Injectable } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import type { AgentContext, AgentResult } from './types';

@Injectable()
export class UserStoriesService {
  constructor(private readonly llm: LlmService) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    const items = ctx.knowledgeItems
      .filter((i) => ['FEATURE', 'FUNCTIONAL_REQUIREMENT', 'USER_STORY', 'PERSONA', 'MODULE'].includes(i.type))
      .map((i) => `[${i.type}] ${i.externalId ?? ''} ${i.title}: ${i.description ?? ''}`)
      .join('\n');

    const prompt = `Project: ${ctx.projectName}\n\nRelevant Knowledge Items:\n${items}\n\nGenerate a complete User Stories & Acceptance Criteria document including:\n- Epic summaries (grouping related stories)\n- User stories in "As a [user], I want [goal], so that [benefit]" format\n- Acceptance criteria for each story (Given/When/Then format)\n- Priority labels (MUST_HAVE, SHOULD_HAVE, COULD_HAVE)\n- Story point estimates (Fibonacci: 1, 2, 3, 5, 8, 13)\n- Dependencies between stories\n\nUse markdown with tables for acceptance criteria.`;

    const r = await this.llm.generateText([
      { role: 'system', content: 'You are an experienced Agile Product Owner. Produce a structured User Stories backlog with clear acceptance criteria in Given/When/Then format. Use markdown tables and proper formatting.' },
      { role: 'user', content: prompt },
    ]);

    return {
      success: true,
      agentKey: 'user-stories',
      knowledgeItems: [{
        type: 'USER_STORIES_DOCUMENT',
        title: `${ctx.projectName} — User Stories & Acceptance Criteria`,
        description: `User Stories backlog with acceptance criteria. Contains ${r.content.length} characters.`,
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
