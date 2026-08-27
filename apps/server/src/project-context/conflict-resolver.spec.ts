import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  type CommitActor,
  type ContextChange,
  type ExistingContextItem,
  contextKey,
  resolveChanges,
} from './conflict-resolver';

const agent: CommitActor = { type: 'agent', key: 'requirements-engineering' };
const user: CommitActor = { type: 'user', key: 'user-1' };

function change(overrides: Partial<ContextChange> = {}): ContextChange {
  return {
    domain: 'functional_requirements',
    operation: 'upsert',
    externalId: 'FR-1',
    item: { title: 'Users can log in' },
    ...overrides,
  };
}

function existing(overrides: Partial<ExistingContextItem> = {}): ExistingContextItem {
  return {
    id: 'item-1',
    domain: 'functional_requirements',
    externalId: 'FR-1',
    version: 1,
    status: 'ACTIVE',
    producerAgent: 'requirements-engineering',
    ...overrides,
  };
}

function keyed(...items: ExistingContextItem[]): Map<string, ExistingContextItem> {
  return new Map(items.map((i) => [contextKey(i.domain, i.externalId), i]));
}

test('upsert on a missing item becomes a create', () => {
  const { plans, conflicts } = resolveChanges([change()], keyed(), agent);
  assert.equal(conflicts.length, 0);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].mode, 'create');
  assert.equal(plans[0].nextVersion, 1);
});

test('agent may update its own item', () => {
  const { plans, conflicts } = resolveChanges(
    [change({ expectedVersion: 1 })],
    keyed(existing()),
    agent,
  );
  assert.equal(conflicts.length, 0);
  assert.equal(plans[0].mode, 'update');
  assert.equal(plans[0].nextVersion, 2);
});

test('stale expectedVersion produces a version conflict', () => {
  const { plans, conflicts } = resolveChanges(
    [change({ expectedVersion: 1 })],
    keyed(existing({ version: 3 })),
    agent,
  );
  assert.equal(plans.length, 0);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].code, 'version_conflict');
  assert.equal(conflicts[0].currentVersion, 3);
});

test('agents cannot silently upsert foreign items', () => {
  const { conflicts } = resolveChanges(
    [change()],
    keyed(existing({ producerAgent: 'product-analysis' })),
    agent,
  );
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].code, 'ownership');
});

test('agents can supersede foreign items', () => {
  const { plans, conflicts } = resolveChanges(
    [change({ operation: 'supersede', expectedVersion: 1, reason: 'refined by RE' })],
    keyed(existing({ producerAgent: 'product-analysis' })),
    agent,
  );
  assert.equal(conflicts.length, 0);
  assert.equal(plans[0].mode, 'supersede');
  assert.equal(plans[0].nextVersion, 2);
});

test('FLAGGED items are read-only for agents', () => {
  const { conflicts } = resolveChanges(
    [change()],
    keyed(existing({ status: 'FLAGGED' })),
    agent,
  );
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].code, 'flagged');
});

test('users may update FLAGGED items', () => {
  const { plans, conflicts } = resolveChanges(
    [change()],
    keyed(existing({ status: 'FLAGGED' })),
    user,
  );
  assert.equal(conflicts.length, 0);
  assert.equal(plans[0].mode, 'update');
});

test('create on an existing item by the same producer is an idempotent no-op', () => {
  const { plans, conflicts } = resolveChanges(
    [change({ operation: 'create', expectedVersion: 1 })],
    keyed(existing()),
    agent,
  );
  assert.equal(conflicts.length, 0);
  assert.equal(plans[0].mode, 'noop');
  assert.equal(plans[0].nextVersion, 1);
});

test('create on an existing foreign item conflicts', () => {
  const { conflicts } = resolveChanges(
    [change({ operation: 'create' })],
    keyed(existing({ producerAgent: 'discovery' })),
    agent,
  );
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].code, 'exists');
});

test('delete of a missing item is an idempotent no-op', () => {
  const { plans, conflicts } = resolveChanges(
    [change({ operation: 'delete' })],
    keyed(),
    agent,
  );
  assert.equal(conflicts.length, 0);
  assert.equal(plans[0].mode, 'noop');
});

test('delete of a foreign item is rejected for agents', () => {
  const { conflicts } = resolveChanges(
    [change({ operation: 'delete' })],
    keyed(existing({ producerAgent: 'discovery' })),
    agent,
  );
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].code, 'ownership');
});

test('changes without an externalId conflict', () => {
  const { conflicts } = resolveChanges([change({ externalId: null })], keyed(), agent);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].code, 'missing_external_id');
});

test('unknown domains are rejected', () => {
  const { conflicts } = resolveChanges([change({ domain: 'not-a-domain' })], keyed(), agent);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].code, 'unknown_domain');
});

test('supersede requires item content', () => {
  const { conflicts } = resolveChanges(
    [change({ operation: 'supersede', item: undefined })],
    keyed(existing()),
    agent,
  );
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].code, 'missing_item');
});
