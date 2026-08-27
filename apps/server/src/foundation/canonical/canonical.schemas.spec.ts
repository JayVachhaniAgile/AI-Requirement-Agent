import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalLlmInputSchema,
  CANONICAL_SCHEMAS,
} from './canonical.schemas';

const baseProvenance = {
  epistemicClass: 'INFERENCE',
  sources: [{ category: 'research', refId: 'res-1' }],
  producedBy: 'discovery',
};

test('requirement schema accepts a fully structured requirement', () => {
  const result = CANONICAL_SCHEMAS.requirement.safeParse({
    externalId: 'FR-001',
    kind: 'requirement',
    title: 'User can log in',
    status: 'CONFIRMED',
    provenance: baseProvenance,
    body: {
      classification: 'functional',
      priority: 'P0',
      actors: ['actor:user'],
      preconditions: ['authenticated'],
      postconditions: ['session created'],
      businessRuleRefs: ['BR-1'],
      acceptanceCriteriaRefs: ['AC-1'],
      dependencies: ['US-1'],
      sourceRefs: [],
      assumptions: [],
      confidence: { value: 80 },
      validationStatus: 'VALIDATED',
    },
  });
  assert.equal(result.success, true);
});

test('requirement schema rejects missing classification', () => {
  const result = canonicalLlmInputSchema.safeParse({
    externalId: 'FR-001',
    kind: 'requirement',
    title: 'Bad requirement',
    provenance: baseProvenance,
    body: { priority: 'P0', confidence: { value: 50 } },
  });
  assert.equal(result.success, false);
  const issues = result.success ? [] : result.error.issues;
  assert.ok(issues.some((i) => i.path.includes('classification')));
});

test('estimate schema rejects pessimistic < mostLikely', () => {
  const result = CANONICAL_SCHEMAS.estimate.safeParse({
    externalId: 'EST-1',
    kind: 'estimate',
    title: 'Build API',
    provenance: baseProvenance,
    body: {
      optimisticHours: 10,
      mostLikelyHours: 20,
      pessimisticHours: 15,
      team: 'core',
    },
  });
  assert.equal(result.success, false);
});

test('non_functional_requirement requires a category', () => {
  const result = CANONICAL_SCHEMAS.non_functional_requirement.safeParse({
    externalId: 'NFR-001',
    kind: 'non_functional_requirement',
    title: 'Page loads fast',
    provenance: baseProvenance,
    body: {
      classification: 'non_functional',
      priority: 'P1',
      category: 'performance',
      confidence: { value: 70 },
    },
  });
  assert.equal(result.success, true);
});

test('unknown kind is rejected by the discriminated union', () => {
  const result = canonicalLlmInputSchema.safeParse({
    externalId: 'X-1',
    kind: 'not_a_kind',
    title: 'Nope',
    provenance: baseProvenance,
    body: {},
  });
  assert.equal(result.success, false);
});
