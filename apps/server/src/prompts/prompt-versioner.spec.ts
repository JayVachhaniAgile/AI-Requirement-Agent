import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTemplateVersion } from './prompt-versioner.service';
import { contentHash } from './prompt-versioner.service';
import { getTemplate } from './template-registry';
import { definePrompt } from './template.types';

test('contentHash is deterministic and stable across calls', () => {
  const a = contentHash('hello world');
  const b = contentHash('hello world');
  assert.equal(a, b);
  assert.equal(a.length, 8);
  assert.notEqual(contentHash('hello world'), contentHash('hello world!'));
});

test('getTemplateVersion returns semver-with-hash version', () => {
  const template = getTemplate('agent:discovery');
  const v = getTemplateVersion(template);
  assert.equal(v.promptKey, 'agent:discovery');
  assert.match(v.promptVersion, /^v1\.1-[0-9a-f]{8}$/);
  assert.match(v.contentHash, /^[0-9a-f]{8}$/);
  assert.equal(typeof v.schemaVersion, 'string');
});

test('manual semantic version rides on top of the content hash', () => {
  const t1 = definePrompt({ key: 'test:ver', kind: 'agent', system: 'Alpha' });
  const t2 = definePrompt({ key: 'test:ver', kind: 'agent', system: 'Alpha', version: { major: 2, minor: 3 } });
  const v1 = getTemplateVersion(t1);
  const v2 = getTemplateVersion(t2);
  assert.match(v1.promptVersion, /^v1\.0-/);
  assert.match(v2.promptVersion, /^v2\.3-/);
  // Same system + same minor afterwards (patch identical, minor differs) => version differs.
  assert.notEqual(v1.promptVersion, v2.promptVersion);
});

test('content hash changes when the system prompt changes', () => {
  const t1 = definePrompt({ key: 'test:hash', kind: 'agent', system: 'Instructions A' });
  const t2 = definePrompt({ key: 'test:hash', kind: 'agent', system: 'Instructions B' });
  assert.notEqual(getTemplateVersion(t1).contentHash, getTemplateVersion(t2).contentHash);
});

test('document templates derive schemaVersion null', () => {
  const v = getTemplateVersion(getTemplate('document:frd'));
  assert.equal(v.schemaVersion, null);
  assert.match(v.promptVersion, /^v1\.1-/);
});
