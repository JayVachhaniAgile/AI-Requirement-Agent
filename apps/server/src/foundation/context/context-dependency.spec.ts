import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ContextEngineService } from './context-engine.service';
import { ContextCache } from './context.cache';
import type { DependencyResolver } from './dependency-resolver';

function fakeRepo(rows: any[] = []) {
  return {
    rows,
    findOne: async (opts: any) => rows.find((r) => r.id === opts?.where?.id) ?? null,
    find: async (opts: any) => {
      const where = opts?.where ?? {};
      return rows.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));
    },
  };
}

function canonicalRow(overrides: any = {}) {
  return {
    id: `can-${overrides.externalId ?? 'FR-1'}`,
    projectId: 'p1',
    kind: 'requirement',
    externalId: 'FR-1',
    title: 'User can log in',
    summary: 'Authentication flow',
    status: 'CONFIRMED',
    version: 1,
    confidence: 85,
    payload: { classification: 'functional', confidence: { value: 85 } },
    provenance: { epistemicClass: 'INFERENCE', sources: [{ category: 'research', refId: 'r1' }] },
    createdBy: 'requirements-engineering',
    ...overrides,
  };
}

const resolver: DependencyResolver = {
  async resolve(projectId, startIds, options) {
    if (projectId !== 'p1') return [];
    return [
      {
        artifactId: 'US-1',
        artifactType: 'USER_STORY',
        artifactTitle: 'User story',
        relation: 'SATISFIES',
        depth: 1,
        confidence: 0.9,
        weight: 1,
        pathIds: ['FR-1', 'US-1'],
      },
      {
        artifactId: 'API-1',
        artifactType: 'API',
        artifactTitle: 'Login API',
        relation: 'IMPLEMENTS',
        depth: 2,
        confidence: 0.8,
        weight: 0.9,
        pathIds: ['FR-1', 'US-1', 'API-1'],
      },
    ].filter((n) => options.direction === 'both' || options.direction === 'downstream');
  },
};

test('context: dependency-aware request adds relationships with paths', async () => {
  const projectRepo = fakeRepo([{ id: 'p1', name: 'Task App', idea: 'auth app', status: 'CREATED' }]);
  const engine = new ContextEngineService(
    projectRepo as any,
    fakeRepo() as any,
    fakeRepo([canonicalRow()]) as any,
    new ContextCache({ maxEntries: 16 }),
    {},
    resolver,
  );
  const pkg = await engine.compile({
    projectId: 'p1',
    agentSkill: 'requirements-engineering',
    taskType: 'requirements',
    artifactIds: ['FR-1'],
    includeDirectDependencies: true,
    dependencyMaxDepth: 2,
    maxTokens: 12000,
  });
  assert.ok(pkg.dependencies.some((d) => d.source.externalId === 'US-1'));
  assert.ok(pkg.dependencies.some((d) => d.source.externalId === 'API-1'));
  const api = pkg.dependencies.find((d) => d.source.externalId === 'API-1');
  assert.deepEqual(api!.dependencyIds, ['FR-1', 'US-1', 'API-1']);
});

test('context: dependency retrieval respects token budget', async () => {
  const projectRepo = fakeRepo([{ id: 'p1', name: 'Task App', idea: 'auth app', status: 'CREATED' }]);
  const bigResolver: DependencyResolver = {
    async resolve() {
      return Array.from({ length: 200 }, (_, i) => ({
        artifactId: `ART-${i}`,
        artifactType: 'API',
        artifactTitle: `Artifact ${i}`,
        relation: 'DEPENDS_ON',
        depth: 1,
        confidence: 0.9,
        weight: 1,
        pathIds: ['FR-1', `ART-${i}`],
      }));
    },
  };
  const engine = new ContextEngineService(
    projectRepo as any,
    fakeRepo() as any,
    fakeRepo([canonicalRow()]) as any,
    new ContextCache({ maxEntries: 16 }),
    {},
    bigResolver,
  );
  const pkg = await engine.compile({
    projectId: 'p1',
    agentSkill: 'ux',
    taskType: 'ux',
    artifactIds: ['FR-1'],
    includeDirectDependencies: true,
    maxTokens: 200,
  });
  // 20% of a 200-token budget cannot fit 200 artifacts.
  assert.ok(pkg.dependencies.length < 200);
});

test('context: no dependency retrieval when not requested', async () => {
  const projectRepo = fakeRepo([{ id: 'p1', name: 'Task App', idea: 'auth app', status: 'CREATED' }]);
  let called = false;
  const spy: DependencyResolver = {
    async resolve() {
      called = true;
      return [];
    },
  };
  const engine = new ContextEngineService(
    projectRepo as any,
    fakeRepo() as any,
    fakeRepo([canonicalRow()]) as any,
    new ContextCache({ maxEntries: 16 }),
    {},
    spy,
  );
  await engine.compile({
    projectId: 'p1',
    agentSkill: 'requirements-engineering',
    taskType: 'requirements',
    maxTokens: 12000,
  });
  assert.equal(called, false);
});


// TODO: test bidirectional dependency retrieval (`includeDirectDependencies` + `includeDependents`).
// TODO: confirm dependency neighbors participate in cache-key invalidation.
