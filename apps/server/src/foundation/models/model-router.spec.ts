import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveModelRoute } from './model-router.policy';

const TIER_OVERRIDES = {
  high: 'gpt-4o',
  standard: 'gpt-4o-mini',
  fast: 'llama-3.1-8b',
};

test('resolveModelRoute maps high-tier skills to the high model', () => {
  const route = resolveModelRoute({
    skillKey: 'requirements-engineering',
    provider: 'openai',
    modelOverrides: TIER_OVERRIDES,
    defaultModel: 'gpt-4o',
  });
  assert.equal(route.model, 'gpt-4o');
  assert.equal(route.tier, 'high');
  assert.equal(route.mode, 'forced-tools');
  assert.equal(route.maxTokens, 6000);
});

test('resolveModelRoute maps fast-tier skills to the fast model', () => {
  const route = resolveModelRoute({
    skillKey: 'research',
    provider: 'groq',
    modelOverrides: TIER_OVERRIDES,
  });
  assert.equal(route.model, 'llama-3.1-8b');
  assert.equal(route.tier, 'fast');
});

test('resolveModelRoute falls back to default model for unknown skills', () => {
  const route = resolveModelRoute({
    skillKey: 'not-a-skill',
    provider: 'openai',
    modelOverrides: TIER_OVERRIDES,
    defaultModel: 'gpt-4o-mini',
  });
  assert.equal(route.model, 'gpt-4o-mini');
  assert.equal(route.tier, null);
  assert.equal(route.skillKey, 'not-a-skill');
});

test('resolveModelRoute handles prompt-only providers (ollama)', () => {
  const route = resolveModelRoute({
    skillKey: 'discovery',
    provider: 'ollama',
    modelOverrides: TIER_OVERRIDES,
  });
  assert.equal(route.mode, 'prompt-only');
});

test('resolveModelRoute supports largeOutput and explicit maxTokens', () => {
  const large = resolveModelRoute({
    skillKey: 'frd',
    provider: 'openai',
    modelOverrides: TIER_OVERRIDES,
    largeOutput: true,
  });
  assert.ok(large.maxTokens >= 6000);
  const capped = resolveModelRoute({
    skillKey: 'discovery',
    provider: 'openai',
    modelOverrides: TIER_OVERRIDES,
    maxTokens: 2048,
  });
  assert.equal(capped.maxTokens, 2048);
});
