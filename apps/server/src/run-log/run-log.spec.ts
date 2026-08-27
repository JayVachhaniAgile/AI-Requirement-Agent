import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateRunLogPatterns, extractLowConfidenceFlags } from './run-log.service';

test('extractLowConfidenceFlags returns items below the threshold only', () => {
  const items = [
    { externalId: 'FR-001', title: 'Low', confidence: 55 },
    { externalId: 'FR-002', title: 'OK', confidence: 85 },
    { externalId: 'FR-003', title: 'No confidence', confidence: undefined },
    { externalId: 'FR-004', title: 'Null confidence', confidence: null },
  ];

  const flags = extractLowConfidenceFlags(items, 70);
  assert.equal(flags.length, 1);
  assert.deepEqual(flags[0], { externalId: 'FR-001', title: 'Low', confidence: 55 });
});

test('aggregateRunLogPatterns buckets events by kind and agent', () => {
  const patterns = aggregateRunLogPatterns([
    {
      kind: 'retry',
      agentKey: 'requirements-engineering',
      message: 'bad relatedFR',
      data: { codes: ['DANGLING_REFERENCE'] },
    },
    {
      kind: 'retry',
      agentKey: 'requirements-engineering',
      message: 'bad relatedFR',
      data: { codes: ['DANGLING_REFERENCE'] },
    },
    {
      kind: 'retry',
      agentKey: 'ux-design',
      message: 'bad enum',
      data: { codes: ['INVALID_ENUM'] },
    },
    { kind: 'parse_failure', agentKey: 'discovery', message: 'unparseable', data: {} },
    { kind: 'validation_failure', agentKey: 'security-review', message: 'gave up', data: {} },
    { kind: 'padding', agentKey: 'ux-design', message: 'hit max', data: {} },
    { kind: 'low_confidence', agentKey: 'requirements-engineering', message: 'low item', data: {} },
  ]);

  assert.deepEqual(patterns.totalsByKind, {
    retry: 3,
    parse_failure: 1,
    validation_failure: 1,
    padding: 1,
    low_confidence: 1,
  });
  assert.deepEqual(patterns.retriesByAgent, {
    'requirements-engineering': 2,
    'ux-design': 1,
    discovery: 1,
  });
  assert.deepEqual(patterns.parseFailuresByAgent, { discovery: 1 });
  assert.deepEqual(patterns.validationFailuresByAgent, { 'security-review': 1 });
  assert.deepEqual(patterns.idIntegrityByAgent, { 'requirements-engineering': 2 });
  assert.deepEqual(patterns.paddingByAgent, { 'ux-design': 1 });
  assert.deepEqual(patterns.lowConfidenceByAgent, { 'requirements-engineering': 1 });
});

test('topFailureMessages surfaces recurring failure messages per agent', () => {
  const patterns = aggregateRunLogPatterns([
    { kind: 'retry', agentKey: 'a', message: 'recurring issue', data: {} },
    { kind: 'retry', agentKey: 'a', message: 'recurring issue', data: {} },
    { kind: 'retry', agentKey: 'a', message: 'recurring issue', data: {} },
    { kind: 'retry', agentKey: 'b', message: 'once', data: {} },
    { kind: 'padding', agentKey: 'c', message: 'padding only', data: {} },
  ]);

  assert.deepEqual(patterns.topFailureMessages[0], {
    agentKey: 'a',
    kind: 'retry',
    message: 'recurring issue',
    count: 3,
  });
  assert.equal(patterns.topFailureMessages.length, 2);
});

test('empty log set produces an empty, valid summary', () => {
  const patterns = aggregateRunLogPatterns([]);
  assert.deepEqual(patterns.totalsByKind, {});
  assert.deepEqual(patterns.topFailureMessages, []);
});
