import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { LlmService } from '../llm/llm.service';
import type { AgentContext, AgentResult, NewKnowledgeItem, NewQuestion } from './types';
import { safeJsonParse } from './agent.utils';

const Schema = z.object({
  ideaInterpretation: z.string(),
  problemStatement: z.string(),
  proposedSolution: z.string(),
  confirmedFacts: z.array(z.object({
    externalId: z.string(), title: z.string(), description: z.string(),
    evidence: z.string().nullish(), reasoning: z.string().nullish(),
  })),
  assumptions: z.array(z.object({
    externalId: z.string(), title: z.string(), description: z.string(),
    reasoning: z.string().nullish(),
  })),
  businessGoals: z.array(z.object({
    externalId: z.string(), title: z.string(), description: z.string(),
    evidence: z.string().nullish(),
  })),
  userGoals: z.array(z.object({ externalId: z.string(), title: z.string(), description: z.string() })),
  users: z.array(z.object({ externalId: z.string(), title: z.string(), description: z.string() })),
  blockingQuestions: z.array(z.object({ question: z.string(), context: z.string().nullish(), isBlocking: z.boolean() })),
  riskFlags: z.array(z.object({ title: z.string(), description: z.string() })),
  initialScope: z.string(),
  reasoningTraces: z.array(z.string()).optional(),
  alternativesConsidered: z.array(z.string()).optional(),
});

const SYSTEM = `You are an expert Discovery Agent for a software Requirements Engineering system.

Analyze the software idea and produce a JSON object with exactly these fields:
- ideaInterpretation: string
- problemStatement: string
- proposedSolution: string
- confirmedFacts: [{externalId: "FACT-001", title, description, evidence?, reasoning?}] — facts explicitly stated (4-8 items)
- assumptions: [{externalId: "ASM-001", title, description, reasoning?}] — reasonable assumptions (4-8 items)
- businessGoals: [{externalId: "BG-001", title, description, evidence?}] — business objectives (3-6 items)
- userGoals: [{externalId: "UG-001", title, description}] — what users want to achieve (3-5 items)
- users: [{externalId: "USER-001", title, description}] — user types/personas (2-4 items)
- blockingQuestions: [{question, context?, isBlocking: true}] — ONLY for fundamentally missing info (0-3 items)
- riskFlags: [{title, description}] — key risks (3-5 items)
- initialScope: string — what's in/out of scope
- reasoningTraces: [string] — step-by-step reasoning for key decisions
- alternativesConsidered: [string] — alternative interpretations considered

For each fact, assumption, and goal:
- evidence: exact quote or excerpt from the user's input that supports this item
- reasoning: why you extracted this item and how it relates to the project

The user may specify a domain (e.g., healthcare, finance, ecommerce, education).
If a domain is provided in the context, apply relevant industry standards, regulations, and best practices.
Rules: Make reasonable assumptions rather than asking questions for minor ambiguities.`;

@Injectable()
export class DiscoveryService {
  constructor(private readonly llm: LlmService) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    const userMsg = `Project: ${ctx.projectName}\n\nSoftware Idea:\n${ctx.idea}\n\n${ctx.domain ? `Domain: ${ctx.domain}` : ''}\n\n${ctx.answeredQuestions.length > 0 ? `Answered Questions:\n${ctx.answeredQuestions.map((q) => `Q: ${q.question}\nA: ${q.answer}`).join('\n\n')}` : ''}`;

    const r = await this.llm.generateStructured([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: userMsg },
    ]);

    const data = Schema.parse(safeJsonParse(r.content));

    const knowledgeItems: NewKnowledgeItem[] = [
      ...data.confirmedFacts.map((f) => ({
        externalId: f.externalId, type: 'CONFIRMED_FACT', title: f.title,
        description: f.description, status: 'CONFIRMED',
        sourceCategory: 'prompt' as const,
        evidence: f.evidence, reasoning: f.reasoning,
      })),
      ...data.assumptions.map((a) => ({
        externalId: a.externalId, type: 'ASSUMPTION', title: a.title,
        description: a.description, status: 'ASSUMED',
        sourceCategory: 'ai_analysis' as const,
        reasoning: a.reasoning,
      })),
      ...data.businessGoals.map((g) => ({
        externalId: g.externalId, type: 'BUSINESS_GOAL', title: g.title,
        description: g.description, status: 'CONFIRMED',
        sourceCategory: 'prompt' as const,
        evidence: g.evidence,
      })),
      ...data.userGoals.map((g) => ({
        externalId: g.externalId, type: 'USER_GOAL', title: g.title,
        description: g.description, status: 'CONFIRMED',
        sourceCategory: 'ai_analysis' as const,
      })),
      ...data.users.map((u) => ({
        externalId: u.externalId, type: 'USER_TYPE', title: u.title,
        description: u.description, status: 'CONFIRMED',
        sourceCategory: 'ai_analysis' as const,
      })),
      ...data.riskFlags.map((r) => ({
        type: 'RISK', title: r.title, description: r.description,
        status: 'DRAFT', sourceCategory: 'ai_analysis' as const,
      })),
      {
        type: 'DISCOVERY_SUMMARY', title: 'Discovery Summary',
        description: `Problem: ${data.problemStatement}\n\nSolution: ${data.proposedSolution}\n\nScope: ${data.initialScope}`,
        status: 'CONFIRMED', sourceCategory: 'ai_analysis' as const,
        reasoning: data.ideaInterpretation,
      },
    ];

    const questions: NewQuestion[] = data.blockingQuestions.map((q) => ({
      question: q.question, context: q.context, isBlocking: q.isBlocking,
    }));

    return {
      success: true,
      agentKey: 'discovery',
      knowledgeItems,
      questions,
      warnings: [],
      reasoningTraces: data.reasoningTraces ?? [],
      alternativesConsidered: data.alternativesConsidered ?? [],
      _tokens: { inputTokens: r.inputTokens, outputTokens: r.outputTokens, model: r.model },
    };
  }
}
