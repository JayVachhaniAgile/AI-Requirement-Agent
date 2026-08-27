import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateArtifactPresence,
  evaluateCoverage,
  evaluateIdIntegrity,
} from './quality-gates.config';

test('evaluateCoverage passes when enough items exist', () => {
  const items = Array.from({ length: 6 }, (_, i) => ({
    externalId: `FR-${i + 1}`,
    type: 'FUNCTIONAL_REQUIREMENT',
    title: `Requirement ${i + 1}`,
  }));
  const result = evaluateCoverage(items, { minItems: 5 });
  assert.equal(result.status, 'PASS');
  assert.equal(result.score, 100);
  assert.equal(result.findings.length, 0);
});

test('evaluateCoverage flags missing required types', () => {
  const items = [
    { externalId: 'FR-1', type: 'FUNCTIONAL_REQUIREMENT', title: 'A' },
  ];
  const result = evaluateCoverage(items, {
    minItems: 5,
    requiredTypes: ['FUNCTIONAL_REQUIREMENT', 'ASSUMPTION'],
  });
  assert.equal(result.status, 'FAIL');
  assert.ok(result.findings.some((f) => f.message.includes('ASSUMPTION')));
});

test('evaluateIdIntegrity detects dangling references', () => {
  const items = [
    {
      externalId: 'FR-1',
      type: 'FUNCTIONAL_REQUIREMENT',
      title: 'A',
      relatedIds: ['US-1', 'US-2'],
    },
    {
      externalId: 'US-1',
      type: 'USER_STORY',
      title: 'B',
      relatedIds: ['FR-1'],
    },
  ];
  const result = evaluateIdIntegrity(items);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.score, 67); // 2 of 3 references resolve (rounded)
});

test('evaluateIdIntegrity passes with no references', () => {
  const result = evaluateIdIntegrity([
    { externalId: 'FR-1', type: 'FUNCTIONAL_REQUIREMENT', title: 'A', relatedIds: [] },
  ]);
  assert.equal(result.status, 'PASS');
  assert.equal(result.score, 100);
});

test('evaluateArtifactPresence reports missing types', () => {
  const result = evaluateArtifactPresence(
    ['FRD_DOCUMENT', 'API_SPEC_DOCUMENT'],
    ['FRD_DOCUMENT', 'SOW_DOCUMENT'],
  );
  assert.equal(result.status, 'FAIL');
  assert.equal(result.score, 50);
  assert.ok(result.findings.some((f) => f.message.includes('SOW_DOCUMENT')));
});
