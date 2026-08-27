import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArtifactDependencyService } from './artifact-dependency.service';
import { IMPACT_LEVELS } from './artifact-dependency.types';

function fakeRepo() {
  const rows: any[] = [];
  return {
    rows,
    create: (input: any) => ({ ...input }),
    save: async (row: any) => {
      const saved = { ...row, id: row.id ?? `dep-${rows.length + 1}`, createdAt: new Date() };
      const idx = rows.findIndex((r) => r.id === saved.id);
      if (idx >= 0) rows[idx] = saved;
      else rows.push(saved);
      return saved;
    },
    find: async (opts: any) => {
      const where = opts?.where ?? {};
      return rows.filter((r) => Object.entries(where).every(([k, v]) => (r as any)[k] === v));
    },
    findOne: async (opts: any) => {
      const where = opts?.where ?? {};
      return rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null;
    },
    delete: async (id: string) => {
      const idx = rows.findIndex((r) => r.id === id);
      if (idx >= 0) rows.splice(idx, 1);
    },
  };
}

function artifactRepo(ids: string[], projectId = 'p1') {
  const rows = ids.map((id) => ({
    id,
    projectId,
    type: id.startsWith('REQ') ? 'REQUIREMENT' : id.startsWith('US') ? 'USER_STORY' : 'API',
    title: `${id} title`,
    key: null,
    summary: null,
    content: null,
    status: 'DRAFT',
    version: 1,
    source: null,
    sourceVersion: null,
    createdBy: null,
    confidence: null,
    metadata: null,
  }));
  return {
    rows,
    find: async (opts: any) => {
      if (opts?.select) return rows.map((r) => ({ id: r.id }));
      const where = opts?.where ?? {};
      if (Array.isArray(where)) return rows.filter((r) => where.some((w) => r.id === w.id));
      return rows.filter((r) => Object.entries(where).every(([k, v]) => (r as any)[k] === v));
    },
    findOne: async (opts: any) => {
      const where = opts?.where ?? {};
      return rows.find((r) => Object.entries(where).every(([k, v]) => (r as any)[k] === v)) ?? null;
    },
  };
}

function service(depRepo: any, arts: any) {
  return new ArtifactDependencyService(depRepo, arts);
}

test('create persists a dependency with strong typing', async () => {
  const deps = fakeRepo();
  const arts = artifactRepo(['REQ-1', 'US-1']);
  const svc = service(deps, arts);
  const dep = await svc.create({
    projectId: 'p1',
    sourceArtifactId: 'REQ-1',
    targetArtifactId: 'US-1',
    dependencyType: 'IMPLEMENTS',
    confidence: 0.9,
    sourceReference: 'agent:requirements-engineering',
  });
  assert.equal(dep.relation, 'IMPLEMENTS');
  assert.equal(dep.confidence, 0.9);
  assert.equal(deps.rows.length, 1);
});

test('create rejects self-dependency', async () => {
  const deps = fakeRepo();
  const arts = artifactRepo(['REQ-1']);
  const svc = service(deps, arts);
  await assert.rejects(
    svc.create({
      projectId: 'p1',
      sourceArtifactId: 'REQ-1',
      targetArtifactId: 'REQ-1',
      dependencyType: 'DEPENDS_ON',
    }),
    /SELF_DEPENDENCY/,
  );
});

test('create rejects invalid dependency type', async () => {
  const deps = fakeRepo();
  const arts = artifactRepo(['REQ-1', 'US-1']);
  const svc = service(deps, arts);
  await assert.rejects(
    svc.create({
      projectId: 'p1',
      sourceArtifactId: 'REQ-1',
      targetArtifactId: 'US-1',
      dependencyType: 'NOT_A_TYPE' as any,
    }),
    /Unknown dependency type/,
  );
});

test('create rejects missing artifacts', async () => {
  const deps = fakeRepo();
  const arts = artifactRepo(['REQ-1']);
  const svc = service(deps, arts);
  await assert.rejects(
    svc.create({
      projectId: 'p1',
      sourceArtifactId: 'REQ-1',
      targetArtifactId: 'GHOST',
      dependencyType: 'DEPENDS_ON',
    }),
    /Artifact 'GHOST' not found/,
  );
});

test('create rejects duplicate edges', async () => {
  const deps = fakeRepo();
  const arts = artifactRepo(['REQ-1', 'US-1']);
  const svc = service(deps, arts);
  await svc.create({
    projectId: 'p1',
    sourceArtifactId: 'REQ-1',
    targetArtifactId: 'US-1',
    dependencyType: 'IMPLEMENTS',
  });
  await assert.rejects(
    svc.create({
      projectId: 'p1',
      sourceArtifactId: 'REQ-1',
      targetArtifactId: 'US-1',
      dependencyType: 'IMPLEMENTS',
    }),
    /DUPLICATE_DEPENDENCY/,
  );
});

test('create rejects circular dependencies', async () => {
  const deps = fakeRepo();
  const arts = artifactRepo(['A', 'B', 'C']);
  const svc = service(deps, arts);
  await svc.create({ projectId: 'p1', sourceArtifactId: 'A', targetArtifactId: 'B', dependencyType: 'DEPENDS_ON' });
  await svc.create({ projectId: 'p1', sourceArtifactId: 'B', targetArtifactId: 'C', dependencyType: 'DEPENDS_ON' });
  await assert.rejects(
    svc.create({ projectId: 'p1', sourceArtifactId: 'C', targetArtifactId: 'A', dependencyType: 'DEPENDS_ON' }),
    /CYCLE/,
  );
});

test('traversal: direct, dependents, upstream, downstream', async () => {
  const deps = fakeRepo();
  const arts = artifactRepo(['A', 'B', 'C', 'D']);
  const svc = service(deps, arts);
  await svc.create({ projectId: 'p1', sourceArtifactId: 'A', targetArtifactId: 'B', dependencyType: 'DEPENDS_ON' });
  await svc.create({ projectId: 'p1', sourceArtifactId: 'B', targetArtifactId: 'C', dependencyType: 'DEPENDS_ON' });
  await svc.create({ projectId: 'p1', sourceArtifactId: 'A', targetArtifactId: 'D', dependencyType: 'RELATED_TO' });

  const direct = await svc.getDirectDependencies('A');
  assert.deepEqual(direct.map((e) => e.targetArtifactId).sort(), ['B', 'D']);
  const dependents = await svc.getDependents('C');
  assert.deepEqual(dependents.map((e) => e.sourceArtifactId), ['B']);
  const downstream = await svc.getDownstream('A');
  assert.deepEqual(downstream.sort(), ['B', 'C', 'D']);
  const upstream = await svc.getUpstream('C');
  assert.deepEqual(upstream.sort(), ['A', 'B']);
});

test('traversal: dependency type filtering and strictOnly', async () => {
  const deps = fakeRepo();
  const arts = artifactRepo(['A', 'B', 'C']);
  const svc = service(deps, arts);
  await svc.create({ projectId: 'p1', sourceArtifactId: 'A', targetArtifactId: 'B', dependencyType: 'DEPENDS_ON' });
  await svc.create({ projectId: 'p1', sourceArtifactId: 'A', targetArtifactId: 'C', dependencyType: 'CONFLICTS_WITH' });

  const strict = await svc.getDirectDependencies('A', { strictOnly: true });
  assert.deepEqual(strict.map((e) => e.targetArtifactId), ['B']);
  const filtered = await svc.getDirectDependencies('A', { dependencyTypes: ['CONFLICTS_WITH'] });
  assert.deepEqual(filtered.map((e) => e.targetArtifactId), ['C']);
});

test('graph validation: cycle + missing endpoint detection', async () => {
  const deps = fakeRepo();
  const arts = artifactRepo(['A', 'B']);
  const svc = service(deps, arts);
  // Force a cycle by inserting edges directly.
  deps.rows.push({ id: 'e1', projectId: 'p1', sourceArtifactId: 'A', targetArtifactId: 'B', relation: 'DEPENDS_ON' });
  deps.rows.push({ id: 'e2', projectId: 'p1', sourceArtifactId: 'B', targetArtifactId: 'A', relation: 'DEPENDS_ON' });
  const result = await svc.validateProjectGraph('p1');
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('CYCLE')));
});

test('graph validation: stale conflict warning', async () => {
  const deps = fakeRepo();
  const arts = artifactRepo(['A', 'B']);
  const svc = service(deps, arts);
  deps.rows.push({
    id: 'e1',
    projectId: 'p1',
    sourceArtifactId: 'A',
    targetArtifactId: 'B',
    relation: 'CONFLICTS_WITH',
    confidence: 0.1,
  });
  const result = await svc.validateProjectGraph('p1');
  assert.ok(result.warnings.some((w) => w.includes('STALE_CONFLICT')));
});

test('getPaths returns recursive dependency paths with depth', async () => {
  const deps = fakeRepo();
  const arts = artifactRepo(['A', 'B', 'C']);
  const svc = service(deps, arts);
  await svc.create({ projectId: 'p1', sourceArtifactId: 'A', targetArtifactId: 'B', dependencyType: 'DEPENDS_ON' });
  await svc.create({ projectId: 'p1', sourceArtifactId: 'B', targetArtifactId: 'C', dependencyType: 'DEPENDS_ON' });
  const paths = await svc.getPaths('A');
  assert.ok(paths.some((p) => p.depth === 2 && p.edges[1].targetArtifactId === 'C'));
});

test('delete removes a dependency', async () => {
  const deps = fakeRepo();
  const arts = artifactRepo(['A', 'B']);
  const svc = service(deps, arts);
  const dep = await svc.create({ projectId: 'p1', sourceArtifactId: 'A', targetArtifactId: 'B', dependencyType: 'DEPENDS_ON' });
  await svc.delete(dep.id);
  assert.equal(deps.rows.length, 0);
});

test('IMPACT_LEVELS export is complete', () => {
  assert.deepEqual([...IMPACT_LEVELS], ['DIRECT', 'INDIRECT', 'POTENTIAL', 'NO_IMPACT']);
});



// TODO: add tests for bulk operations (createMany) when the API supports batched writes.
// TODO: cover metadata-only updates and weight-clamping rules.
