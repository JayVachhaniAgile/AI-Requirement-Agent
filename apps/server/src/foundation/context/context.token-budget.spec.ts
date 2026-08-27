import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONTEXT_BUDGETS,
  estimateTokens,
  loadBudgets,
  truncateToTokens,
} from './context.token-budget';

test('default budgets match the Phase 3 spec', () => {
  assert.equal(DEFAULT_CONTEXT_BUDGETS.requirements, 12000);
  assert.equal(DEFAULT_CONTEXT_BUDGETS.ux, 8000);
  assert.equal(DEFAULT_CONTEXT_BUDGETS.database, 10000);
  assert.equal(DEFAULT_CONTEXT_BUDGETS.security, 8000);
  assert.equal(DEFAULT_CONTEXT_BUDGETS.architecture, 12000);
});

test('loadBudgets reads env overrides', () => {
  const budgets = loadBudgets({ CONTEXT_BUDGET_REQUIREMENTS: '16000', CONTEXT_BUDGET_SECURITY: '2000' });
  assert.equal(budgets.requirements, 16000);
  assert.equal(budgets.security, 2000);
  assert.equal(budgets.ux, 8000); // untouched default
});

test('loadBudgets ignores invalid overrides', () => {
  const budgets = loadBudgets({ CONTEXT_BUDGET_UX: 'bogus', CONTEXT_BUDGET_DATABASE: '-5' });
  assert.equal(budgets.ux, 8000);
  assert.equal(budgets.database, 10000);
});

test('estimateTokens scales with text length', () => {
  assert.ok(estimateTokens('a'.repeat(400)) > estimateTokens('a'.repeat(40)));
  assert.equal(estimateTokens(''), 0);
});

test('truncateToTokens truncates long text with a marker', () => {
  const short = truncateToTokens('hello world', 1000);
  assert.equal(short.truncated, false);
  const long = truncateToTokens('a'.repeat(1000), 10);
  assert.equal(long.truncated, true);
  assert.ok(long.text.endsWith('…[truncated]'));
});
