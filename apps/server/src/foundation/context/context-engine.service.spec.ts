import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ContextEngineService } from './context-engine.service';
import { ContextCache } from './context.cache';
import type { ContextRequest } from './context.types';

function fakeRepo(rows: any[] = []) {
  return {
    rows,
    findOne: async (opts: any) =>
      rows.find((r) => r.id === opts?.where?.id) ?? null,
    find: async (opts: any) => {
      const where = opts?.where ?? {};
      return rows.filter((r) =>
        Object.entries(where).every(([k, v]) => r[k] === v),
      );
    },
  };
}

function canonicalRow(overrides: any = {}) {
  return {
    id: `can-${overrides.externalId ?? 'x'}`,
    projectId: 'p1',
    kind: 'requirement',
    externalId: 'FR-1',
    title: 'User can log in',
    summary: 'Authentication flow',
    status: 'CONFIRMED',
    version: 1,
    confidence: 85,
    payload: {
      classification: 'functional',
      priority: 'P0',
      dependencies: ['US-1'],
      confidence: { value: 85 },
    },
    provenance: {
      epistemicClass: 'INFERENCE',
      sources: [{ category: 'research', refId: 'res-1' }],
    },
    createdBy: 'requirements-engineering',
    ...overrides,
  };
}

function knowledgeRow(overrides: any = {}) {
  return {
    id: `kb-${overrides.externalId ?? '1'}`,
    projectId: 'p1',
    externalId: 'RES-1',
    type: 'RISK',
    title: 'Rate limit risk',
    description: 'The security review flagged throttling as a risk for public endpoints.',
    status: 'CONFIRMED',
    version: 1,
    source: 'security-review',
    relatedIds: [],
    metadata: JSON.stringify({ confidence: 70, provenance: [{ category: 'research', refId: 'res-2' }] }),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    createdAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  };
}

function request(overrides: Partial<ContextRequest> = {}): ContextRequest {
  return {
    projectId: 'p1',
    agentSkill: 'requirements-engineering',
    taskType: 'requirements',
    artifactTypes: ['requirement', 'actor'],
    domains: ['functional_requirements'],
    evidenceRequired: false,
    maxTokens: 12000,
    ...overrides,
  };
}

test('compile retrieves structured artifacts and exposes dependency layer', async () => {
  const projectRepo = fakeRepo([
    { id: 'p1', name: 'Task App', idea: 'A task management app with auth and reminders', status: 'COMPLETED' },
  ]);
  const kiRepo = fakeRepo([knowledgeRow()]);
  const canonicalRepo = fakeRepo([canonicalRow()]);
  const engine = new ContextEngineService(
    projectRepo as any,
    kiRepo as any,
    canonicalRepo as any,
    new ContextCache({ maxEntries: 16 }),
    {},
  );

  const pkg = await engine.compile(request());
  assert.equal(pkg.projectId, 'p1');
  assert.ok(pkg.projectSummary.includes('Task App'));
  assert.ok(pkg.relevantArtifacts.some((i) => i.source.externalId === 'FR-1'));
  // dependency layer: FR-1 payload declares dependencies: ['US-1']
  assert.ok(pkg.dependencies.some((i) => i.source.externalId === 'FR-1'));
  assert.equal(pkg.warnings.length, 0);
});

test('compile enforces the token budget', async () => {
  const projectRepo = fakeRepo([
    { id: 'p1', name: 'Big', idea: 'x', status: 'CREATED' },
  ]);
  const items = Array.from({ length: 40 }, (_, i) =>
    canonicalRow({
      externalId: `FR-${i}`,
      title: `Requirement ${i} with a fairly long title to consume budget`,
      summary: 'A long summary '.repeat(20),
    }),
  );
  const engine = new ContextEngineService(
    projectRepo as any,
    fakeRepo() as any,
    fakeRepo(items) as any,
    new ContextCache({ maxEntries: 16 }),
    {},
  );

  const pkg = await engine.compile(request({ maxTokens: 500 }));
  // The budget caps both the number of items and the token estimate.
  assert.ok(pkg.relevantArtifacts.length < 40);
  assert.ok(pkg.tokenEstimate <= 900); // estimate is approximate; generous bound
});

test('compile warns when no context matches (missing context)', async () => {
  const engine = new ContextEngineService(
    fakeRepo() as any,
    fakeRepo() as any,
    fakeRepo() as any,
    new ContextCache({ maxEntries: 16 }),
    {},
  );
  const pkg = await engine.compile(request());
  assert.ok(pkg.warnings.some((w) => w.includes('No structured context matched')));
  assert.equal(pkg.relevantArtifacts.length, 0);
});

test('compile detects conflicting sources for the same externalId', async () => {
  const projectRepo = fakeRepo([
    { id: 'p1', name: 'Task App', idea: 'idea', status: 'CREATED' },
  ]);
  const canonical = canonicalRow({ externalId: 'FR-1', summary: 'Version A of the requirement' });
  const knowledge = knowledgeRow({
    externalId: 'FR-1',
    type: 'FUNCTIONAL_REQUIREMENT',
    title: 'User can log in',
    description: 'Version B of the requirement',
  });
  const engine = new ContextEngineService(
    projectRepo as any,
    fakeRepo([knowledge]) as any,
    fakeRepo([canonical]) as any,
    new ContextCache({ maxEntries: 16 }),
    {},
  );
  const pkg = await engine.compile(request());
  assert.ok(pkg.warnings.some((w) => w.includes('CONFLICTING_SOURCES')));
});

test('lexical evidence retrieval returns matching unstructured text', async () => {
  const projectRepo = fakeRepo([
    { id: 'p1', name: 'Sec', idea: 'Security hardened app', status: 'CREATED' },
  ]);
  const knowledge = [
    knowledgeRow({
      externalId: 'DOC-1',
      type: 'DOCUMENT_SUMMARY',
      title: 'Security research notes',
      description: 'Threat model: authentication, authorization, data protection, audit logging.',
    }),
    knowledgeRow({
      externalId: 'DOC-2',
      type: 'DOCUMENT_SUMMARY',
      title: 'Unrelated finance memo',
      description: 'Budget and invoice processing details for the finance team.',
    }),
  ];
  const engine = new ContextEngineService(
    projectRepo as any,
    fakeRepo(knowledge) as any,
    fakeRepo() as any,
    new ContextCache({ maxEntries: 16 }),
    {},
  );
  const pkg = await engine.compile(
    request({
      agentSkill: 'security-review',
      taskType: 'security',
      artifactTypes: [],
      evidenceRequired: true,
    }),
  );
  assert.ok(pkg.relevantEvidence.length >= 1);
  assert.ok(pkg.relevantEvidence[0].text.toLowerCase().includes('threat'));
});

test('cache serves a second identical request; version bump invalidates', async () => {
  const projectRepo = fakeRepo([
    { id: 'p1', name: 'Task App', idea: 'idea', status: 'CREATED' },
  ]);
  const canonicalRepo = fakeRepo([canonicalRow({ version: 1 })]);
  const engine = new ContextEngineService(
    projectRepo as any,
    fakeRepo() as any,
    canonicalRepo as any,
    new ContextCache({ maxEntries: 16 }),
    {},
  );

  const first = await engine.compile(request());
  assert.equal(first.cached, false);
  const second = await engine.compile(request());
  assert.equal(second.cached, true);

  // Bump the source version — fingerprint changes → cache miss.
  canonicalRepo.rows[0].version = 2;
  const third = await engine.compile(request());
  assert.equal(third.cached, false);
});
