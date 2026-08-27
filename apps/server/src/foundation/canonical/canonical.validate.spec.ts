import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBlocking, validateBusinessRules } from './canonical.validate';
import type { CanonicalLlmInput } from './canonical.schemas';

function requirement(overrides: Partial<CanonicalLlmInput> = {}): CanonicalLlmInput {
  return {
    externalId: 'FR-1',
    kind: 'requirement',
    title: 'A requirement',
    provenance: {
      epistemicClass: 'FACT',
      sources: [{ category: 'user_input', refId: 'idea' }],
    },
    body: {
      classification: 'functional',
      priority: 'P1',
      actors: ['actor:user'],
      preconditions: [],
      postconditions: [],
      businessRuleRefs: [],
      acceptanceCriteriaRefs: [],
      dependencies: [],
      sourceRefs: [],
      assumptions: [],
      confidence: { value: 90 },
      validationStatus: 'UNVALIDATED',
    },
    ...overrides,
  } as CanonicalLlmInput;
}

test('FACT without sources is a blocking issue', () => {
  const input = requirement({
    provenance: { epistemicClass: 'FACT', sources: [] },
  });
  const result = validateBusinessRules(input);
  assert.ok(result.issues.some((i) => i.code === 'FACT_WITHOUT_SOURCE'));
  assert.equal(isBlocking(result.issues), true);
});

test('functional requirement without actor is a non-blocking warning', () => {
  const input = requirement({
    body: {
      classification: 'functional',
      priority: 'P1',
      actors: [],
      preconditions: [],
      postconditions: [],
      businessRuleRefs: [],
      acceptanceCriteriaRefs: [],
      dependencies: [],
      sourceRefs: [],
      assumptions: [],
      confidence: { value: 80 },
      validationStatus: 'UNVALIDATED',
    },
  });
  const result = validateBusinessRules(input);
  assert.ok(result.issues.some((i) => i.code === 'FUNCTIONAL_REQ_NEEDS_ACTOR'));
  assert.equal(isBlocking(result.issues), false);
});

test('ASSUMPTION with high confidence is flagged', () => {
  const input = requirement({
    provenance: { epistemicClass: 'ASSUMPTION', sources: [{ category: 'ai_assumption' }] },
  });
  const result = validateBusinessRules(input);
  assert.ok(result.issues.some((i) => i.code === 'ASSUMPTION_HIGH_CONFIDENCE'));
});

test('self-referential relationship is flagged', () => {
  const input = {
    externalId: 'REL-1',
    kind: 'relationship',
    title: 'Rel',
    provenance: { epistemicClass: 'INFERENCE', sources: [{ category: 'ai_inference' }] },
    body: { fromEntityRef: 'ENT-1', toEntityRef: 'ENT-1', relation: 'one-to-one' },
  } as CanonicalLlmInput;
  const result = validateBusinessRules(input);
  assert.ok(result.issues.some((i) => i.code === 'RELATIONSHIP_SELF'));
});

test('clean input produces no issues', () => {
  const result = validateBusinessRules(requirement());
  assert.deepEqual(result.issues, []);
});
