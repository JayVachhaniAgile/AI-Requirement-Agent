import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { LlmService } from '../llm/llm.service';
import { AgentItemArray, buildUserPrompt, ensureItemIds, ensureSummary, formatKnowledge, safeJsonParse } from './agent.utils';
import type { AgentContext, AgentResult, NewKnowledgeItem } from './types';

const Schema = z.object({
  aiPipeline: z.string().default(''),
  llmSelection: AgentItemArray,
  promptStrategy: AgentItemArray,
  embeddings: AgentItemArray,
  vectorStore: AgentItemArray,
  memoryContext: AgentItemArray,
  guardrails: AgentItemArray,
  aiArchitectureSummary: z.string().default(''),
});

const SYSTEM = `You are an expert AI Architect for a software engineering platform.

Produce JSON with exactly these fields:
- aiPipeline: string — end-to-end AI flow
- llmSelection: [{externalId: "LLM-001", title, description}] (2-4)
- promptStrategy: [{externalId: "PROMPT-001", title, description}] (3-6)
- embeddings: [{externalId: "EMB-001", title, description}] (2-4)
- vectorStore: [{externalId: "VEC-001", title, description}] (1-3)
- memoryContext: [{externalId: "MEM-001", title, description}] (2-4)
- guardrails: [{externalId: "GRD-001", title, description}] (3-6)
- aiArchitectureSummary: string

If the product is not AI-heavy, still propose a light, justified AI assist layer where valuable. Stay realistic about cost and latency.`;

@Injectable()
export class AiArchitectService {
  constructor(private readonly llm: LlmService) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    const context = formatKnowledge(ctx.knowledgeItems, [
      'FEATURE', 'MODULE', 'FUNCTIONAL_REQUIREMENT', 'TECHNOLOGY_SUGGESTION',
      'PRODUCT_VISION', 'RESEARCH_SUMMARY', 'SCREEN',
    ]);

    const r = await this.llm.generateStructured([
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: buildUserPrompt(ctx.projectName, ctx.idea, [
          { label: 'Product & Tech Context', body: context },
        ], 'Produce AI architecture as JSON.'),
      },
    ]);

    const data = Schema.parse(safeJsonParse(r.content));
    const aiArchitectureSummary = ensureSummary(data.aiArchitectureSummary, `AI architecture for ${ctx.projectName}`);
    const aiPipeline = ensureSummary(data.aiPipeline, 'Ingest → extract → enrich → recommend → persist → audit.');
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
      ...llmSelection.map((i) => ({ externalId: i.externalId, type: 'LLM_SELECTION', title: i.title, description: i.description, status: 'DRAFT' })),
      ...promptStrategy.map((i) => ({ externalId: i.externalId, type: 'PROMPT_STRATEGY', title: i.title, description: i.description, status: 'CONFIRMED' })),
      ...embeddings.map((i) => ({ externalId: i.externalId, type: 'EMBEDDING_DESIGN', title: i.title, description: i.description, status: 'CONFIRMED' })),
      ...vectorStore.map((i) => ({ externalId: i.externalId, type: 'VECTOR_STORE', title: i.title, description: i.description, status: 'CONFIRMED' })),
      ...memoryContext.map((i) => ({ externalId: i.externalId, type: 'AI_MEMORY', title: i.title, description: i.description, status: 'CONFIRMED' })),
      ...guardrails.map((i) => ({ externalId: i.externalId, type: 'AI_GUARDRAIL', title: i.title, description: i.description, status: 'CONFIRMED' })),
    ];

    return {
      success: true,
      agentKey: 'ai-architect',
      knowledgeItems,
      questions: [],
      warnings: [],
      _tokens: { inputTokens: r.inputTokens, outputTokens: r.outputTokens, model: r.model },
    };
  }
}
