import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateCost, getModelRate } from './model-pricing';

test('getModelRate resolves exact and prefixed model names', () => {
  assert.deepEqual(getModelRate('gpt-4o'), { inputPer1M: 2.5, outputPer1M: 10 });
  assert.deepEqual(getModelRate('gpt-4o-2024-08-06'), { inputPer1M: 2.5, outputPer1M: 10 });
  assert.deepEqual(getModelRate('claude-3-5-sonnet-20241022'), {
    inputPer1M: 3,
    outputPer1M: 15,
  });
});

test('getModelRate falls back to a default for unknown models', () => {
  const rate = getModelRate('mystery-model');
  assert.ok(rate.inputPer1M > 0 && rate.outputPer1M > 0);
});

test('estimateCost computes per-model cost from token counts', () => {
  const cost = estimateCost('gpt-4o', 1_000_000, 100_000);
  assert.equal(cost.inputCostUsd, 2.5);
  assert.equal(cost.outputCostUsd, 1);
  assert.equal(cost.totalCostUsd, 3.5);
});

test('estimateCost is zero for zero tokens', () => {
  const cost = estimateCost('gpt-4o', 0, 0);
  assert.equal(cost.totalCostUsd, 0);
});
