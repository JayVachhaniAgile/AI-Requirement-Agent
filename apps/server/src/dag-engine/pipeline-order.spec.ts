import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PIPELINE_AGENT_ORDER,
  PIPELINE_STAGES,
  assertNoForwardReferences,
  getPipelinePosition,
  stageKeyToAgentKey,
} from './pipeline.config';
import { AGENT_VALIDATION_CONFIGS } from '../validation/agent-validation.config';
import type { AgentValidationConfig } from '../validation/validation.types';
import { AGENT_STRUCTURED_SCHEMAS } from '../llm/agent-json-schemas';

/** On-demand agents that are registered but not pipeline stages. */
const NON_PIPELINE_AGENTS = new Set(['gap-analysis', 'gap-patch']);

/** The 14 structured agents in canonical pipeline order. */
const CANONICAL_ORDER = [
  'discovery',
  'research',
  'business-analysis',
  'product-analysis',
  'requirements-engineering',
  'ux-design',
  'data-architecture',
  'ai-architecture',
  'solution-architecture',
  'security-review',
  'qa-planning',
  'estimation',
  'validation',
  'debate',
];

test('pipeline order is a single source of truth matching the canonical order', () => {
  const structuredPart = PIPELINE_AGENT_ORDER.slice(0, CANONICAL_ORDER.length);
  assert.deepEqual(structuredPart, CANONICAL_ORDER);
});

test('stage keys and agent keys are unique and consistently derived', () => {
  const keys = PIPELINE_STAGES.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length, 'duplicate stage keys');

  const agentKeys = PIPELINE_STAGES.map((s) => stageKeyToAgentKey(s.key));
  assert.equal(new Set(agentKeys).size, agentKeys.length, 'duplicate agent keys');

  // Reverse derivation must round-trip (used by regenerate endpoint).
  assert.equal(stageKeyToAgentKey('REQUIREMENTS_ENGINEERING'), 'requirements-engineering');
});

test('no agent schema references an agent that has not run yet (P1-2 lock)', () => {
  const referenceRules = Object.fromEntries(
    Object.entries(AGENT_VALIDATION_CONFIGS)
      .filter(([agentKey]) => !NON_PIPELINE_AGENTS.has(agentKey))
      .map(([agentKey, config]: [string, AgentValidationConfig]) => [agentKey, config.references ?? []]),
  );

  const violations = assertNoForwardReferences(referenceRules);
  assert.deepEqual(violations, [], `forward references found:\n${violations.join('\n')}`);
});

test('every structured agent appears in the pipeline order, and vice versa', () => {
  for (const agentKey of Object.keys(AGENT_VALIDATION_CONFIGS)) {
    if (NON_PIPELINE_AGENTS.has(agentKey)) continue;
    assert.ok(
      PIPELINE_AGENT_ORDER.includes(agentKey),
      `validation config exists for '${agentKey}' but it is missing from the pipeline`,
    );
  }
  for (const agentKey of Object.keys(AGENT_STRUCTURED_SCHEMAS)) {
    if (NON_PIPELINE_AGENTS.has(agentKey)) continue;
    assert.ok(
      PIPELINE_AGENT_ORDER.includes(agentKey),
      `structured schema exists for '${agentKey}' but it is missing from the pipeline`,
    );
  }
});

test('Business Analysis runs before Product Analysis (deliberate reconciliation)', () => {
  const ba = getPipelinePosition('business-analysis');
  const pm = getPipelinePosition('product-analysis');
  assert.ok(ba !== -1 && pm !== -1);
  assert.ok(ba < pm, 'business-analysis must precede product-analysis');
});

test('open-reference agents (critic/debate) run last, after every producer', () => {
  const last = CANONICAL_ORDER.length - 1;
  assert.equal(getPipelinePosition('validation'), last - 1);
  assert.equal(getPipelinePosition('debate'), last);
});

test('assertNoForwardReferences flags a hypothetical future reference', () => {
  const violations = assertNoForwardReferences({
    discovery: [{ allowedPrefixes: ['BR'] }], // BR is produced later by business-analysis
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0], /business-analysis/);
  assert.match(violations[0], /runs after/);
});

test('unknown prefix and unknown agent are both reported', () => {
  const violations = assertNoForwardReferences({
    discovery: [{ allowedPrefixes: ['NOPE'] }],
    'not-an-agent': [{ allowedPrefixes: ['BR'] }],
  });
  assert.equal(violations.length, 2);
  assert.ok(violations.some((v) => /unknown prefix 'NOPE'/.test(v)));
  assert.ok(violations.some((v) => /'not-an-agent' is not part of the pipeline order/.test(v)));
});
