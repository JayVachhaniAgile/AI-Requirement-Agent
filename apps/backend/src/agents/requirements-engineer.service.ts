import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { LlmService } from '../llm/llm.service';
import type { AgentContext, AgentResult, NewKnowledgeItem } from './types';

const ACSchema = z.object({ id: z.string(), given: z.string(), when: z.string(), then: z.string() });
const FRSchema = z.object({
  externalId: z.string(), title: z.string(), module: z.string(), actor: z.string(),
  description: z.string(), priority: z.enum(['MUST_HAVE', 'SHOULD_HAVE', 'COULD_HAVE']),
  relatedBR: z.string().optional(), relatedFeature: z.string().optional(),
  acceptanceCriteria: z.array(ACSchema).default([]),
  validationRules: z.array(z.string()).optional(),
  errorConditions: z.array(z.string()).optional(),
});

const Schema = z.object({
  functionalRequirements: z.array(FRSchema).default([]),
  userStories: z.array(z.object({ externalId: z.string(), title: z.string(), asA: z.string(), iWant: z.string(), soThat: z.string(), relatedFR: z.string().optional() })).default([]),
});

const SYSTEM = `You are an expert Requirements Engineer for a software Requirements Engineering system.

Produce JSON with:
- functionalRequirements: array (10-20 FRs): { externalId: "FR-001", title, module, actor, description, priority: MUST_HAVE|SHOULD_HAVE|COULD_HAVE, relatedBR?, relatedFeature?, acceptanceCriteria: [{id: "AC-001-01", given, when, then}], validationRules?: string[], errorConditions?: string[] }
- userStories: array: { externalId: "US-001", title, asA, iWant, soThat, relatedFR? }

Each FR must have at least 2 acceptance criteria in Given/When/Then format.`;

@Injectable()
export class RequirementsEngineerService {
  constructor(private readonly llm: LlmService) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    const features = ctx.knowledgeItems.filter((i) => i.type === 'FEATURE').map((i) => `${i.externalId ?? ''}: ${i.title} — ${i.description ?? ''}`).join('\n');
    const modules = ctx.knowledgeItems.filter((i) => i.type === 'MODULE').map((i) => `${i.externalId ?? ''}: ${i.title}`).join('\n');
    const brs = ctx.knowledgeItems.filter((i) => i.type === 'BUSINESS_REQUIREMENT').map((i) => `${i.externalId ?? ''}: ${i.title}`).join('\n');

    const r = await this.llm.generateStructured([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Project: ${ctx.projectName}\n\nIdea: ${ctx.idea}\n\nModules:\n${modules}\n\nFeatures:\n${features}\n\nBusiness Requirements:\n${brs}\n\nGenerate comprehensive FRs and user stories as JSON.` },
    ]);

    const data = Schema.parse(JSON.parse(r.content));
    const functionalRequirements = data.functionalRequirements.map((fr) => ({
      ...fr,
      acceptanceCriteria: fr.acceptanceCriteria.length > 0
        ? fr.acceptanceCriteria
        : [
            {
              id: `${fr.externalId}-AC-01`,
              given: `the ${fr.actor.toLowerCase()} is using the ${fr.module.toLowerCase()} module`,
              when: fr.title.toLowerCase(),
              then: 'the system should complete the action successfully',
            },
            {
              id: `${fr.externalId}-AC-02`,
              given: 'required inputs are missing or invalid',
              when: fr.title.toLowerCase(),
              then: 'the system should show a clear validation error and prevent invalid processing',
            },
          ],
    }));
    const userStories = data.userStories.length > 0
      ? data.userStories
      : functionalRequirements.map((fr, index) => ({
          externalId: `US-${String(index + 1).padStart(3, '0')}`,
          title: fr.title,
          asA: fr.actor,
          iWant: fr.description,
          soThat: `I can complete the ${fr.module.toLowerCase()} workflow successfully`,
          relatedFR: fr.externalId,
        }));
    const knowledgeItems: NewKnowledgeItem[] = [
      ...functionalRequirements.map((fr) => ({
        externalId: fr.externalId, type: 'FUNCTIONAL_REQUIREMENT', title: fr.title, status: 'CONFIRMED',
        description: [`Module: ${fr.module}`, `Actor: ${fr.actor}`, `Priority: ${fr.priority}`, `\nDescription: ${fr.description}`,
          fr.relatedBR ? `Related BR: ${fr.relatedBR}` : '', fr.relatedFeature ? `Related Feature: ${fr.relatedFeature}` : '',
          `\nAcceptance Criteria:\n${fr.acceptanceCriteria.map((ac) => `${ac.id}: Given ${ac.given}, When ${ac.when}, Then ${ac.then}`).join('\n')}`,
          fr.validationRules?.length ? `\nValidation Rules:\n${fr.validationRules.join('\n')}` : '',
          fr.errorConditions?.length ? `\nError Conditions:\n${fr.errorConditions.join('\n')}` : '',
        ].filter(Boolean).join('\n'),
        relatedIds: [fr.relatedBR, fr.relatedFeature].filter(Boolean) as string[],
      })),
      ...userStories.map((us) => ({
        externalId: us.externalId, type: 'USER_STORY', title: us.title, status: 'CONFIRMED',
        description: `As a ${us.asA}, I want ${us.iWant}, so that ${us.soThat}${us.relatedFR ? `\nRelated FR: ${us.relatedFR}` : ''}`,
        relatedIds: us.relatedFR ? [us.relatedFR] : [],
      })),
    ];
    return { success: true, agentKey: 'requirements-engineer', knowledgeItems, questions: [], warnings: [], _tokens: { inputTokens: r.inputTokens, outputTokens: r.outputTokens, model: r.model } };
  }
}
