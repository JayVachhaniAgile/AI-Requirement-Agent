import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deduplicate,
  filterByConfidence,
  rankScore,
  recencyScore,
  taskTypeWeight,
} from './context.ranker';
import type { ContextItem, ContextRequest } from './context.types';

function item(kind: string, externalId: string, confidence?: number): ContextItem {
  return {
    source: { sourceKind: 'canonical', externalId, kind, version: 1 },
    title: externalId,
    confidence,
    score: 0,
    tokenEstimate: 10,
  };
}

const request: ContextRequest = {
  projectId: 'p1',
  agentSkill: 'requirements-engineering',
  taskType: 'requirements',
  artifactTypes: ['requirement', 'actor'],
  domains: ['functional_requirements'],
  maxTokens: 12000,
};

test('taskTypeWeight boosts kinds relevant to the task', () => {
  assert.ok(taskTypeWeight('requirements', 'requirement') > taskTypeWeight('requirements', 'screen'));
  assert.ok(taskTypeWeight('ux', 'screen') === 1);
  assert.equal(taskTypeWeight('requirements', 'unknown_kind'), 0.5);
});

test('recencyScore decays with age and hard-cuts beyond recency window', () => {
  const now = new Date('2026-08-10T00:00:00Z');
  const fresh = recencyScore('2026-08-09T00:00:00Z', now);
  const old = recencyScore('2026-01-01T00:00:00Z', now);
  assert.ok(fresh > old);
  assert.equal(recencyScore('2026-01-01T00:00:00Z', now, 7), 0);
});

test('rankScore orders task-relevant, high-confidence, recent items first', () => {
  const now = new Date('2026-08-10T00:00:00Z');
  const relevant = rankScore({
    item: { ...item('requirement', 'FR-1', 95), source: { sourceKind: 'canonical', externalId: 'FR-1', kind: 'requirement', version: 1 } },
    request,
    now,
    pinned: true,
    domainMatch: true,
  });
  const irrelevant = rankScore({
    item: { ...item('screen', 'SCR-1', 20), source: { sourceKind: 'canonical', externalId: 'SCR-1', kind: 'screen', version: 1 } },
    request,
    now,
    pinned: false,
    domainMatch: false,
  });
  assert.ok(relevant > irrelevant);
});

test('filterByConfidence keeps items at or above the threshold', () => {
  const filtered = filterByConfidence(
    [item('requirement', 'FR-1', 95), item('requirement', 'FR-2', 40), item('requirement', 'FR-3')],
    70,
  );
  assert.deepEqual(filtered.map((i) => i.source.externalId), ['FR-1', 'FR-3']);
});

test('deduplicate removes duplicate externalIds keeping the first', () => {
  const deduped = deduplicate([
    item('requirement', 'FR-1'),
    item('requirement', 'FR-1'),
    item('actor', 'ACT-1'),
  ]);
  assert.equal(deduped.length, 2);
});
