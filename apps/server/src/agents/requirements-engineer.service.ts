import { Injectable, Logger, Optional } from '@nestjs/common';
import { z } from 'zod';
import { LlmService } from '../llm/llm.service';
import { AgentRunnerService, AgentValidationError } from './agent-runner.service';
import { buildAgentMessages } from '../prompts/prompt-builder.service';
import { SkillExecutorService } from '../foundation/skills/skill-executor.service';
import { getAgentStructuredSchema } from '../llm/agent-json-schemas';
import { withSourceAttribution, safeJsonParse } from './agent.utils';
import type { AgentContext, AgentResult, NewKnowledgeItem } from './types';

const ACSchema = z.object({
  id: z.string(),
  given: z.string(),
  when: z.string(),
  then: z.string(),
});
const FRSchema = z.object({
  externalId: z.string().optional().default(''),
  title: z.string(),
  module: z.string(),
  actor: z.string(),
  description: z.string(),
  priority: z.enum(['MUST_HAVE', 'SHOULD_HAVE', 'COULD_HAVE']),
  relatedBR: z.string().nullish(),
  relatedFeature: z.string().nullish(),
  acceptanceCriteria: z.array(ACSchema).default([]),
  validationRules: z.array(z.string()).optional(),
  errorConditions: z.array(z.string()).optional(),
  evidence: z.string().nullish(),
  reasoning: z.string().nullish(),
});

const Schema = z.object({
  lowConfidenceFlags: z.array(z.object({ field: z.string(), reason: z.string() })).default([]),
  functionalRequirements: z.array(FRSchema).default([]),
  userStories: z
    .array(
      z.object({
        externalId: z.string().optional().default(''),
        title: z.string(),
        asA: z.string(),
        iWant: z.string(),
        soThat: z.string(),
        relatedFR: z.string().nullish(),
        evidence: z.string().nullish(),
        reasoning: z.string().nullish(),
      }),
    )
    .default([]),
});

const REQUIREMENTS_ENGINEERING_SCHEMA = getAgentStructuredSchema('requirements-engineering');


@Injectable()
export class RequirementsEngineerService {
  private readonly logger = new Logger(RequirementsEngineerService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly agentRunner: AgentRunnerService,
    @Optional() private readonly skillExecutor?: SkillExecutorService,
  ) {}

  async run(ctx: AgentContext): Promise<AgentResult> {

    let data: z.infer<typeof Schema>;
    let tokens: { inputTokens: number; outputTokens: number; model: string };
    let fallbackUsed = false;
    try {
      const result = await this.agentRunner.run({
        agentKey: 'requirements-engineering',
        messages: buildAgentMessages('requirements-engineering', ctx),
        schema: REQUIREMENTS_ENGINEERING_SCHEMA,
        parse: (content) => Schema.parse(safeJsonParse(content)),
        upstreamItems: ctx.knowledgeItems,
        projectId: ctx.projectId,
      });
      data = result.output;
      tokens = result.tokens;
    await this.skillExecutor?.recordExecution({
      skillKey: 'requirements-engineering',
      projectId: ctx.projectId,
      model: tokens.model,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      durationMs: 0,
    }).catch(() => undefined);
    await this.skillExecutor?.postPersist({
      projectId: ctx.projectId,
      skillKey: 'requirements-engineering',
    }).catch(() => undefined);

    } catch (err) {
      if (!(err instanceof AgentValidationError)) throw err;
      // Last-resort safety net: the model repeatedly returned an empty
      // functionalRequirements array. Derive FRs deterministically from the
      // upstream context so the pipeline cannot hard-fail on an empty output.
      this.logger.warn(
        `requirements-engineering fell back to deterministic FR generation: ${err.message}`,
      );
      fallbackUsed = true;
      data = this.buildDeterministicOutput(ctx);
      tokens = { inputTokens: 0, outputTokens: 0, model: 'deterministic-fallback' };
    }
    const functionalRequirements = data.functionalRequirements.map((fr) => ({
      ...fr,
      acceptanceCriteria:
        fr.acceptanceCriteria.length > 0
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
                then: 'the system should show a clear validation error',
              },
            ],
    }));
    const userStories =
      data.userStories.length > 0
        ? data.userStories
        : functionalRequirements.map((fr, index) => ({
            externalId: `US-${String(index + 1).padStart(3, '0')}`,
            title: fr.title,
            asA: fr.actor,
            iWant: fr.description,
            soThat: `I can complete the ${fr.module.toLowerCase()} workflow successfully`,
            relatedFR: fr.externalId,
            evidence: undefined,
            reasoning: undefined,
          }));

    const knowledgeItems: NewKnowledgeItem[] = [
      ...withSourceAttribution(
        functionalRequirements.map((fr) => ({
          externalId: fr.externalId,
          type: 'FUNCTIONAL_REQUIREMENT',
          title: fr.title,
          status: 'CONFIRMED' as const,
          description: [
            `Module: ${fr.module}`,
            `Actor: ${fr.actor}`,
            `Priority: ${fr.priority}`,
            `\nDescription: ${fr.description}`,
            fr.relatedBR ? `Related BR: ${fr.relatedBR}` : '',
            fr.relatedFeature ? `Related Feature: ${fr.relatedFeature}` : '',
            `\nAcceptance Criteria:\n${fr.acceptanceCriteria.map((ac) => `${ac.id}: Given ${ac.given}, When ${ac.when}, Then ${ac.then}`).join('\n')}`,
            fr.validationRules?.length
              ? `\nValidation Rules:\n${fr.validationRules.join('\n')}`
              : '',
            fr.errorConditions?.length
              ? `\nError Conditions:\n${fr.errorConditions.join('\n')}`
              : '',
          ]
            .filter(Boolean)
            .join('\n'),
          relatedIds: [fr.relatedBR, fr.relatedFeature].filter(Boolean) as string[],
          evidence: fr.evidence,
          reasoning: fr.reasoning,
        })),
        { agentKey: 'requirements-engineer', defaultSourceCategory: 'ai_analysis' },
      ),
      ...withSourceAttribution(
        userStories.map((us) => ({
          externalId: us.externalId,
          type: 'USER_STORY' as const,
          title: us.title,
          status: 'CONFIRMED' as const,
          description: `As a ${us.asA}, I want ${us.iWant}, so that ${us.soThat}${us.relatedFR ? `\nRelated FR: ${us.relatedFR}` : ''}`,
          relatedIds: us.relatedFR ? [us.relatedFR] : [],
          evidence: us.evidence,
          reasoning: us.reasoning,
        })),
        { agentKey: 'requirements-engineer', defaultSourceCategory: 'ai_analysis' },
      ),
    ];

    return {
      success: true,
      agentKey: 'requirements-engineer',
      knowledgeItems,
      questions: [],
      warnings: fallbackUsed
        ? ['LLM returned empty output; functional requirements were generated deterministically from upstream context.']
        : [],
      reasoningTraces: [
        `Generated ${functionalRequirements.length} functional requirements and ${userStories.length} user stories${fallbackUsed ? ' (deterministic fallback)' : ''}`,
      ],
      _tokens: tokens,
    };
  }

  /**
   * Deterministic fallback used when the LLM exhausts its retries without
   * producing any functional requirements. Derives FRs from upstream features
   * (or modules/BRs/idea when no features exist) so the output still passes
   * the same validation contract the LLM path must satisfy.
   */
  private buildDeterministicOutput(ctx: AgentContext): z.infer<typeof Schema> {
    const featureItems = ctx.knowledgeItems.filter((i) => i.type === 'FEATURE');
    const moduleItems = ctx.knowledgeItems.filter((i) => i.type === 'MODULE');
    const brItems = ctx.knowledgeItems.filter((i) => i.type === 'BUSINESS_REQUIREMENT');
    const validBrIds = new Set(
      brItems.map((b) => b.externalId ?? '').filter((id) => /^BR-/.test(id)),
    );

    const sources =
      featureItems.length > 0
        ? featureItems
        : moduleItems.length > 0
          ? moduleItems
          : brItems.length > 0
            ? brItems
            : [];

    const functionalRequirements = sources.slice(0, 20).map((source, index) => {
      const pad = String(index + 1).padStart(3, '0');
      const prioMatch = (source.title ?? '').match(
        /^\[(MUST_HAVE|SHOULD_HAVE|COULD_HAVE|FUTURE)\]\s*(.*)/,
      );
      const priority = prioMatch?.[1] === 'FUTURE' ? 'COULD_HAVE' : (prioMatch?.[1] ?? 'MUST_HAVE');
      const title = prioMatch?.[2]?.trim() || source.title || 'Untitled requirement';
      const module =
        source.type === 'FEATURE'
          ? (source.description?.match(/Module:\s*(.+)/)?.[1]?.trim() ?? 'Core')
          : source.type === 'MODULE'
            ? source.title
            : 'Core';
      const relatedFeature =
        source.type === 'FEATURE' && /^FEAT-/.test(source.externalId ?? '')
          ? source.externalId ?? undefined
          : undefined;
      const relatedBR =
        source.type === 'FEATURE'
          ? (source.description?.match(/Related:\s*(BR-[A-Za-z0-9-]+)/)?.[1] ?? undefined)
          : source.type === 'BUSINESS_REQUIREMENT' && /^BR-/.test(source.externalId ?? '')
            ? (source.externalId ?? undefined)
            : undefined;
      const description =
        (source.description ?? '').replace(/\nModule:.*$/s, '').trim() ||
        `Requirement derived from: ${source.title}`;

      return {
        externalId: `FR-${pad}`,
        title,
        module,
        actor: 'User',
        description,
        priority: priority as 'MUST_HAVE' | 'SHOULD_HAVE' | 'COULD_HAVE',
        relatedBR: relatedBR && validBrIds.has(relatedBR) ? relatedBR : undefined,
        relatedFeature,
        acceptanceCriteria: [
          {
            id: `AC-${pad}-01`,
            given: `the user is using the ${module} module`,
            when: title,
            then: 'the system completes the action successfully',
          },
          {
            id: `AC-${pad}-02`,
            given: 'required inputs are missing or invalid',
            when: title,
            then: 'the system shows a clear validation error',
          },
        ],
        validationRules: [],
        errorConditions: [],
        evidence: `Derived deterministically from ${source.type} '${source.externalId ?? source.title}'`,
        reasoning:
          'Fallback: the LLM returned an empty functionalRequirements array; this item was generated programmatically from upstream context.',
      };
    });

    // Absolute last resort: no features/modules/BRs at all — derive one FR
    // from the original idea so the contract minimum (>= 1) still holds.
    const frs =
      functionalRequirements.length > 0
        ? functionalRequirements
        : [
            {
              externalId: 'FR-001',
              title: 'Core product capability',
              module: 'Core',
              actor: 'User',
              description: ctx.idea ?? 'The core capability of the proposed product.',
              priority: 'MUST_HAVE' as const,
              relatedBR: undefined,
              relatedFeature: undefined,
              acceptanceCriteria: [
                {
                  id: 'AC-001-01',
                  given: 'the user is using the product',
                  when: 'the core capability is triggered',
                  then: 'the system completes the action successfully',
                },
              ],
              validationRules: [],
              errorConditions: [],
              evidence: 'Derived deterministically from the original idea',
              reasoning:
                'Fallback: no upstream features, modules, or business requirements were available.',
            },
          ];

    return {
      lowConfidenceFlags: [
        {
          field: 'functionalRequirements',
          reason:
            'LLM returned an empty output; items were generated deterministically from upstream context.',
        },
      ],
      functionalRequirements: frs,
      userStories: [],
    };
  }
}
