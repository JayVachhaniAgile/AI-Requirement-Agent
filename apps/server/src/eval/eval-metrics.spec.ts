import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFrScaling, summarizeRunLogs, validateGoldenDataset } from './eval-metrics';
import { GOLDEN_DATASET } from './golden-dataset';

test('FR count scales with feature count when not pinned at max', () => {
  assert.deepEqual(evaluateFrScaling(12, 8), {
    featureCount: 8,
    frCount: 12,
    ratio: 1.5,
    atMax: false,
    scaled: true,
  });
});

test('FR count pinned at the stated max is flagged (prompt-quota filling)', () => {
  const metric = evaluateFrScaling(20, 4);
  assert.equal(metric.atMax, true);
  assert.equal(metric.scaled, false);
});

test('excessive FR:FEAT ratio is flagged as not scaling', () => {
  const metric = evaluateFrScaling(19, 3);
  assert.equal(metric.atMax, false);
  assert.equal(metric.scaled, false);
});

test('no features yields a null ratio and is still considered scaled when below max', () => {
  const metric = evaluateFrScaling(10, 0);
  assert.equal(metric.ratio, null);
  assert.equal(metric.scaled, true);
});

test('summarizeRunLogs maps persisted events to metric categories', () => {
  const summary = summarizeRunLogs([
    {
      kind: 'retry',
      agentKey: 'requirements-engineering',
      data: { codes: ['DANGLING_REFERENCE'] },
    },
    { kind: 'retry', agentKey: 'requirements-engineering', data: { codes: ['INVALID_ENUM'] } },
    { kind: 'parse_failure', agentKey: 'discovery', data: {} },
    { kind: 'validation_failure', agentKey: 'security-review', data: {} },
    { kind: 'padding', agentKey: 'ux-design', data: {} },
  ]);

  assert.equal(summary.retries, 2);
  assert.equal(summary.parseFailures, 1);
  assert.equal(summary.validationFailures, 1);
  assert.equal(summary.idIntegrityViolations, 1);
  assert.equal(summary.paddingFlags, 1);
  assert.deepEqual(summary.retriesByAgent, { 'requirements-engineering': 2 });
});

test('golden dataset has 5-10 valid, unique entries', () => {
  const problems = validateGoldenDataset(GOLDEN_DATASET);
  assert.deepEqual(problems, []);
});
