import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_MAX_TOKENS,
  AGENT_MODEL_TIERS,
  resolveAgentModel,
  tierEnvName,
} from './agent-model.config';
import { AGENT_VALIDATION_CONFIGS } from '../validation/agent-validation.config';

const NO_OVERRIDES = {};
const DEFAULT = 'default-model';

test('high-tier agents use LLM_MODEL_HIGH when configured', () => {
  const env = { high: 'gpt-4o', standard: 'gpt-4o-mini', fast: 'llama-3.1-8b' };
  assert.equal(resolveAgentModel('requirements-engineering', env, DEFAULT), 'gpt-4o');
  assert.equal(resolveAgentModel('solution-architecture', env, DEFAULT), 'gpt-4o');
  assert.equal(resolveAgentModel('validation', env, DEFAULT), 'gpt-4o');
  assert.equal(resolveAgentModel('debate', env, DEFAULT), 'gpt-4o');
});

test('fast-tier agents (research, estimation) use the cheaper model', () => {
  const env = { fast: 'llama-3.1-8b' };
  assert.equal(resolveAgentModel('research', env, DEFAULT), 'llama-3.1-8b');
  assert.equal(resolveAgentModel('estimation', env, DEFAULT), 'llama-3.1-8b');
});

test('missing overrides fall back to the default model', () => {
  assert.equal(resolveAgentModel('requirements-engineering', NO_OVERRIDES, DEFAULT), DEFAULT);
  assert.equal(resolveAgentModel('discovery', NO_OVERRIDES, DEFAULT), DEFAULT);
});

test('unknown or missing agent keys use the default model', () => {
  assert.equal(resolveAgentModel('not-an-agent', { high: 'gpt-4o' }, DEFAULT), DEFAULT);
  assert.equal(resolveAgentModel(undefined, { high: 'gpt-4o' }, DEFAULT), DEFAULT);
});

test('spec tier assignment: RE/Solution/Debate high, Research/Estimation fast', () => {
  assert.equal(AGENT_MODEL_TIERS['requirements-engineering'], 'high');
  assert.equal(AGENT_MODEL_TIERS['solution-architecture'], 'high');
  assert.equal(AGENT_MODEL_TIERS.validation, 'high');
  assert.equal(AGENT_MODEL_TIERS.debate, 'high');
  assert.equal(AGENT_MODEL_TIERS.research, 'fast');
  assert.equal(AGENT_MODEL_TIERS.estimation, 'fast');
});

test('every structured agent has a tier configured', () => {
  for (const agentKey of Object.keys(AGENT_VALIDATION_CONFIGS)) {
    assert.ok(AGENT_MODEL_TIERS[agentKey], `missing tier for agent '${agentKey}'`);
  }
});

test('tier env names follow the LLM_MODEL_<TIER> convention', () => {
  assert.equal(tierEnvName('high'), 'LLM_MODEL_HIGH');
  assert.equal(tierEnvName('standard'), 'LLM_MODEL_STANDARD');
  assert.equal(tierEnvName('fast'), 'LLM_MODEL_FAST');
});

test('max_tokens floors follow the fixed-prompts guidance', () => {
  assert.equal(AGENT_MAX_TOKENS['requirements-engineering'], 6000);
  assert.equal(AGENT_MAX_TOKENS['qa-planning'], 6000);
  assert.equal(AGENT_MAX_TOKENS.debate, 5000);
  assert.equal(AGENT_MAX_TOKENS.validation, 4000);
  assert.equal(AGENT_MAX_TOKENS.research, 3000);
  assert.equal(AGENT_MAX_TOKENS.estimation, 3000);
});

test('every structured agent has a max_tokens floor', () => {
  for (const agentKey of Object.keys(AGENT_VALIDATION_CONFIGS)) {
    assert.ok(AGENT_MAX_TOKENS[agentKey], `missing max_tokens for agent '${agentKey}'`);
  }
});
