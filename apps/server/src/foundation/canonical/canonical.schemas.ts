import { z } from 'zod';
import {
  CANONICAL_KINDS,
  CANONICAL_STATUS,
  SOURCE_CATEGORY,
  EPISTEMIC_CLASS,
} from './canonical.types';

export const sourceRefSchema = z.object({
  category: z.enum(SOURCE_CATEGORY),
  refId: z.string().trim().min(1).max(200).optional(),
  label: z.string().trim().max(500).optional(),
  excerpt: z.string().trim().max(2000).optional(),
});

export const provenanceSchema = z.object({
  epistemicClass: z.enum(EPISTEMIC_CLASS),
  sources: z.array(sourceRefSchema).default([]),
  producedBy: z.string().trim().max(100).optional(),
  schemaVersion: z.string().trim().max(64).optional(),
});

export const confidenceSchema = z.object({
  value: z.number().int().min(0).max(100),
  reason: z.string().trim().max(500).optional(),
});

const id = z.string().trim().min(1, 'externalId required').max(100);
const title = z.string().trim().min(1, 'title required').max(500);
const summary = z.string().trim().max(2000).optional();

const requirementBodySchema = z.object({
  classification: z.enum(['functional', 'non_functional']),
  priority: z.enum(['P0', 'P1', 'P2', 'P3']),
  actors: z.array(id).default([]),
  preconditions: z.array(z.string().trim().min(1)).default([]),
  postconditions: z.array(z.string().trim().min(1)).default([]),
  businessRuleRefs: z.array(id).default([]),
  acceptanceCriteriaRefs: z.array(id).default([]),
  dependencies: z.array(id).default([]),
  sourceRefs: z.array(sourceRefSchema).default([]),
  assumptions: z.array(z.string().trim().min(1)).default([]),
  confidence: confidenceSchema,
  validationStatus: z
    .enum(['UNVALIDATED', 'VALIDATED', 'FLAGGED', 'REJECTED'])
    .default('UNVALIDATED'),
});

// Base fields shared by every canonical object envelope.
const envelope = z.object({
  externalId: id,
  kind: z.enum(CANONICAL_KINDS),
  title,
  summary,
  status: z.enum(CANONICAL_STATUS).default('DRAFT'),
  version: z.number().int().min(1).max(1000).default(1),
  provenance: provenanceSchema,
});

// Per-kind schemas. Each kind inherits the envelope and refines the body
// with its own strongly typed payload. Bodies that don't carry structured
// requirements fall back to a generic record.

const projectSchema = envelope.extend({
  kind: z.literal('project'),
  body: z
    .object({
      idea: z.string().trim().min(1).max(20000),
      vision: z.string().trim().max(2000).optional(),
    })
    .strict(),
});

const projectGoalSchema = envelope.extend({
  kind: z.literal('project_goal'),
  body: z
    .object({
      description: z.string().trim().min(1),
      successMetric: z.string().trim().max(500).optional(),
    })
    .strict(),
});

const actorSchema = envelope.extend({
  kind: z.literal('actor'),
  body: z
    .object({
      role: z.string().trim().min(1),
      description: z.string().trim().max(2000).optional(),
      goals: z.array(z.string().trim().min(1)).default([]),
    })
    .strict(),
});

const domainSchema = envelope.extend({
  kind: z.literal('domain'),
  body: z
    .object({
      name: z.string().trim().min(1),
      description: z.string().trim().max(2000).optional(),
    })
    .strict(),
});

const businessProcessSchema = envelope.extend({
  kind: z.literal('business_process'),
  body: z
    .object({
      description: z.string().trim().min(1),
      steps: z.array(z.string().trim().min(1)).default([]),
      actorRefs: z.array(id).default([]),
    })
    .strict(),
});

const requirementSchema = envelope.extend({
  kind: z.literal('requirement'),
  body: requirementBodySchema,
});

const nonFunctionalRequirementSchema = envelope.extend({
  kind: z.literal('non_functional_requirement'),
  body: requirementBodySchema.extend({
    category: z.enum(['performance', 'security', 'usability', 'reliability', 'maintainability', 'scalability']),
  }),
});

const businessRuleSchema = envelope.extend({
  kind: z.literal('business_rule'),
  body: z
    .object({
      statement: z.string().trim().min(1),
      condition: z.string().trim().max(2000).optional(),
      consequence: z.string().trim().max(2000).optional(),
    })
    .strict(),
});

const assumptionSchema = envelope.extend({
  kind: z.literal('assumption'),
  body: z
    .object({
      statement: z.string().trim().min(1),
      impactIfViolated: z.string().trim().max(2000).optional(),
    })
    .strict(),
});

const constraintSchema = envelope.extend({
  kind: z.literal('constraint'),
  body: z
    .object({
      statement: z.string().trim().min(1),
      category: z.enum(['technical', 'business', 'regulatory', 'resource']),
    })
    .strict(),
});

const riskSchema = envelope.extend({
  kind: z.literal('risk'),
  body: z
    .object({
      description: z.string().trim().min(1),
      likelihood: z.enum(['low', 'medium', 'high']),
      impact: z.enum(['low', 'medium', 'high']),
      mitigation: z.string().trim().max(2000).optional(),
    })
    .strict(),
});

const questionSchema = envelope.extend({
  kind: z.literal('question'),
  body: z
    .object({
      prompt: z.string().trim().min(1),
      isBlocking: z.boolean().default(false),
      answer: z.string().trim().max(2000).optional(),
      context: z.string().trim().max(2000).optional(),
    })
    .strict(),
});

const userStorySchema = envelope.extend({
  kind: z.literal('user_story'),
  body: z
    .object({
      asA: z.string().trim().min(1),
      iWant: z.string().trim().min(1),
      soThat: z.string().trim().min(1),
      actorRef: id.optional(),
      requirementRefs: z.array(id).default([]),
    })
    .strict(),
});

const acceptanceCriterionSchema = envelope.extend({
  kind: z.literal('acceptance_criterion'),
  body: z
    .object({
      given: z.string().trim().min(1),
      when: z.string().trim().min(1),
      then: z.string().trim().min(1),
      userStoryRef: id.optional(),
    })
    .strict(),
});

const entitySchema = envelope.extend({
  kind: z.literal('entity'),
  body: z
    .object({
      name: z.string().trim().min(1),
      attributes: z
        .array(
          z.object({
            name: z.string().trim().min(1),
            type: z.string().trim().min(1),
            required: z.boolean().default(false),
          }),
        )
        .default([]),
      description: z.string().trim().max(2000).optional(),
    })
    .strict(),
});

const relationshipSchema = envelope.extend({
  kind: z.literal('relationship'),
  body: z
    .object({
      fromEntityRef: id,
      toEntityRef: id,
      relation: z.enum(['one-to-one', 'one-to-many', 'many-to-many']),
      description: z.string().trim().max(2000).optional(),
    })
    .strict(),
});

const screenSchema = envelope.extend({
  kind: z.literal('screen'),
  body: z
    .object({
      purpose: z.string().trim().min(1),
      actorRefs: z.array(id).default([]),
      requirementRefs: z.array(id).default([]),
      fields: z
        .array(
          z.object({
            name: z.string().trim().min(1),
            kind: z.enum(['input', 'output', 'action']),
          }),
        )
        .default([]),
    })
    .strict(),
});

const apiSchema = envelope.extend({
  kind: z.literal('api'),
  body: z
    .object({
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
      path: z.string().trim().min(1),
      summary: z.string().trim().max(500).optional(),
      requirementRefs: z.array(id).default([]),
      requestSchema: z.string().trim().max(500).optional(),
      responseSchema: z.string().trim().max(500).optional(),
    })
    .strict(),
});

const securityRequirementSchema = envelope.extend({
  kind: z.literal('security_requirement'),
  body: requirementBodySchema.extend({
    category: z.enum([
      'authentication',
      'authorization',
      'data_protection',
      'audit',
      'compliance',
      'threat',
    ]),
  }),
});

const architectureDecisionSchema = envelope.extend({
  kind: z.literal('architecture_decision'),
  body: z
    .object({
      decision: z.string().trim().min(1),
      rationale: z.string().trim().min(1).max(5000),
      alternatives: z.array(z.string().trim().min(1)).default([]),
      consequences: z.array(z.string().trim().min(1)).default([]),
    })
    .strict(),
});

const testCaseSchema = envelope.extend({
  kind: z.literal('test_case'),
  body: z
    .object({
      type: z.enum(['unit', 'integration', 'e2e', 'performance', 'security']),
      requirementRefs: z.array(id).default([]),
      acceptanceCriteriaRefs: z.array(id).default([]),
      steps: z.array(z.string().trim().min(1)).default([]),
      expectedResult: z.string().trim().min(1),
    })
    .strict(),
});

const estimateSchema = envelope.extend({
  kind: z.literal('estimate'),
  body: z
    .object({
      scopeItemRef: id.optional(),
      optimisticHours: z.number().nonnegative(),
      mostLikelyHours: z.number().nonnegative(),
      pessimisticHours: z.number().nonnegative(),
      team: z.string().trim().min(1),
    })
    .strict()
    .refine((v) => v.optimisticHours <= v.mostLikelyHours, {
      message: 'optimisticHours must be <= mostLikelyHours',
      path: ['optimisticHours'],
    })
    .refine((v) => v.mostLikelyHours <= v.pessimisticHours, {
      message: 'mostLikelyHours must be <= pessimisticHours',
      path: ['mostLikelyHours'],
    }),
});

const scopeItemSchema = envelope.extend({
  kind: z.literal('scope_item'),
  body: z
    .object({
      inScope: z.boolean().default(true),
      description: z.string().trim().min(1),
      requirementRefs: z.array(id).default([]),
    })
    .strict(),
});

export const CANONICAL_SCHEMAS = {
  project: projectSchema,
  project_goal: projectGoalSchema,
  actor: actorSchema,
  domain: domainSchema,
  business_process: businessProcessSchema,
  requirement: requirementSchema,
  non_functional_requirement: nonFunctionalRequirementSchema,
  business_rule: businessRuleSchema,
  assumption: assumptionSchema,
  constraint: constraintSchema,
  risk: riskSchema,
  question: questionSchema,
  user_story: userStorySchema,
  acceptance_criterion: acceptanceCriterionSchema,
  entity: entitySchema,
  relationship: relationshipSchema,
  screen: screenSchema,
  api: apiSchema,
  security_requirement: securityRequirementSchema,
  architecture_decision: architectureDecisionSchema,
  test_case: testCaseSchema,
  estimate: estimateSchema,
  scope_item: scopeItemSchema,
} as const;

export type CanonicalSchemas = typeof CANONICAL_SCHEMAS;

/** Discriminated union of all parsed canonical objects (LLM-shaped input). */
export const canonicalLlmInputSchema = z.discriminatedUnion('kind', [
  projectSchema,
  projectGoalSchema,
  actorSchema,
  domainSchema,
  businessProcessSchema,
  requirementSchema,
  nonFunctionalRequirementSchema,
  businessRuleSchema,
  assumptionSchema,
  constraintSchema,
  riskSchema,
  questionSchema,
  userStorySchema,
  acceptanceCriterionSchema,
  entitySchema,
  relationshipSchema,
  screenSchema,
  apiSchema,
  securityRequirementSchema,
  architectureDecisionSchema,
  testCaseSchema,
  estimateSchema,
  scopeItemSchema,
]);

export type CanonicalLlmInput = z.infer<typeof canonicalLlmInputSchema>;
