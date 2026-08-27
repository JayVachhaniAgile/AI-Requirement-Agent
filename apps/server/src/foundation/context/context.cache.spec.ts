import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ContextCache } from './context.cache';
import type { ContextCompileResult, ContextPackage, ContextRequest, ContextSourceRef } from './context.types';

const request: ContextRequest = {
  projectId: 'p1',
  agentSkill: 'security-review',
  taskType: 'security',
  maxTokens: 8000,
};

const refs: ContextSourceRef[] = [
  { projectId: 'p1', sourceKind: 'canonical', externalId: 'SEC-1', kind: 'security_requirement', version: 1 },
  { projectId: 'p1', sourceKind: 'knowledge_item', externalId: 'kb-1', kind: 'RISK', version: 2 },
];

function result(sourceFingerprint: string): ContextCompileResult {
  const pkg: ContextPackage = {
    projectId: 'p1',
    agentSkill: 'security-review',
    taskType: 'security',
    projectSummary: 'x',
    relevantArtifacts: [],
    relevantEvidence: [],
    dependencies: [],
    decisions: [],
    assumptions: [],
    openQuestions: [],
    tokenEstimate: 10,
    sourceReferences: refs,
    generatedAt: new Date().toISOString(),
    cached: false,
    cacheKey: 'k',
    warnings: [],
  };
  return { package: pkg, sourceFingerprint };
}

test('cache key is stable for equal requests and changes on request change', () => {
  const a = ContextCache.buildKey(request, 'fp');
  const b = ContextCache.buildKey(request, 'fp');
  const c = ContextCache.buildKey({ ...request, maxTokens: 999 }, 'fp');
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('sourceFingerprint is order-independent and version-aware', () => {
  const f1 = ContextCache.sourceFingerprint(refs);
  const f2 = ContextCache.sourceFingerprint([...refs].reverse());
  assert.equal(f1, f2);
  const bumped = ContextCache.sourceFingerprint(
    refs.map((r, i) => (i === 0 ? { ...r, version: 2 } : r)),
  );
  assert.notEqual(f1, bumped);
});

test('get returns undefined on miss and result on hit', () => {
  const cache = new ContextCache();
  const key = ContextCache.buildKey(request, 'fp');
  assert.equal(cache.get(key), undefined);
  cache.put(key, result('fp'));
  assert.ok(cache.get(key));
});

test('invalidate removes entries referencing a source', () => {
  const cache = new ContextCache();
  const key = ContextCache.buildKey(request, 'fp');
  cache.put(key, result('fp'));
  assert.equal(cache.size(), 1);
  const removed = cache.invalidate((ref) => ref.externalId === 'SEC-1');
  assert.equal(removed, 1);
  assert.equal(cache.size(), 0);
});

test('LRU evicts the oldest entry when over capacity', () => {
  const cache = new ContextCache({ maxEntries: 2 });
  const r1 = { ...request, maxTokens: 100 };
  const r2 = { ...request, maxTokens: 200 };
  const r3 = { ...request, maxTokens: 300 };
  cache.put(ContextCache.buildKey(r1, 'f1'), result('f1'));
  cache.put(ContextCache.buildKey(r2, 'f2'), result('f2'));
  cache.put(ContextCache.buildKey(r3, 'f3'), result('f3'));
  assert.equal(cache.size(), 2);
  assert.equal(cache.get(ContextCache.buildKey(r1, 'f1')), undefined);
  assert.ok(cache.get(ContextCache.buildKey(r3, 'f3')));
});
