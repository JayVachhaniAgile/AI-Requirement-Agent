import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DebateService } from './debate.service';

test('low-confidence context lists every flag with its agent and field', () => {
  const context = DebateService.formatLowConfidenceContext([
    { agentKey: 'ux-design', field: 'screens', reason: 'thin upstream input' },
    { agentKey: 'research', field: 'competitors', reason: 'could not verify competitor' },
  ]);

  assert.match(context, /\[ux-design\] screens/);
  assert.match(context, /\[research\] competitors/);
  assert.match(context, /surface each one as an assumption to validate/);
});

test('low-confidence context handles the empty case', () => {
  const context = DebateService.formatLowConfidenceContext([]);
  assert.match(context, /none/);
});
