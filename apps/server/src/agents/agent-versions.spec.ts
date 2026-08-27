import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_PROMPT_VERSIONS,
  contentHash,
  getAgentVersions,
  getSchemaVersion,
} from './agent-versions';
import { AGENT_VALIDATION_CONFIGS } from '../validation/agent-validation.config';
import { AGENT_STRUCTURED_SCHEMAS } from '../llm/agent-json-schemas';

test('content hash is deterministic for identical input', () => {
  assert.equal(contentHash('same-input'), contentHash('same-input'));
});

test('content hash changes when the input changes', () => {
  assert.notEqual(contentHash('schema-v1'), contentHash('schema-v2'));
});

test('schema version is stable across calls and changes with schema content', () => {
  assert.equal(
    getSchemaVersion('requirements-engineering'),
    getSchemaVersion('requirements-engineering'),
  );
  assert.notEqual(getSchemaVersion('requirements-engineering'), getSchemaVersion('ux-design'));
});

test('every structured agent has an explicit prompt version and a schema version', () => {
  for (const agentKey of Object.keys(AGENT_VALIDATION_CONFIGS)) {
    assert.ok(AGENT_PROMPT_VERSIONS[agentKey], `missing prompt version for '${agentKey}'`);
    const versions = getAgentVersions(agentKey);
    assert.match(versions.promptVersion, /^v\d+$/);
    assert.match(versions.schemaVersion, /^[0-9a-f]{8}$/);
  }
});

test('every structured JSON schema is covered by a prompt version', () => {
  for (const agentKey of Object.keys(AGENT_STRUCTURED_SCHEMAS)) {
    assert.ok(AGENT_PROMPT_VERSIONS[agentKey], `missing prompt version for '${agentKey}'`);
  }
});

test('unknown agents fall back to a v1 prompt version with a valid schema hash', () => {
  const versions = getAgentVersions('not-an-agent');
  assert.equal(versions.promptVersion, 'v1');
  assert.match(versions.schemaVersion, /^[0-9a-f]{8}$/);
});
