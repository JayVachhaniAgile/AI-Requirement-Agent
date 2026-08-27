import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ImpactAnalysisService } from './impact-analysis.service';

function fakeDepRepo(rows: any[] = []) {
  return {
    find: async (opts: any) => {
      const where = opts?.where ?? {};
      return rows.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));
    },
  };
}

function fakeArtifactRepo(rows: any[] = []) {
  return {
    find: async (opts: any) => {
      const where = opts?.where ?? {};
      return rows.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));
    },
  };
}

function artifact(id: string, type: string) {
  return { id, projectId: 'p1', type, title: `${id} title` };
}

function dep(id: string, source: string, target: string, relation: string) {
  return {
    id,
    projectId: 'p1',
    sourceArtifactId: source,
    targetArtifactId: target,
    relation,
    weight: 1,
    confidence: 0.9,
    sourceReference: null,
    createdBy: null,
    metadata: null,
    createdAt: new Date(),
  };
}

test('impact: requirement change cascades through user story → API → DB', async () => {
  const edges = [
    dep('e1', 'US-1', 'REQ-1', 'SATISFIES'),
    dep('e2', 'API-1', 'US-1', 'IMPLEMENTS'),
    dep('e3', 'DB-1', 'API-1', 'DERIVED_FROM'),
    dep('e4', 'QA-1', 'API-1', 'VALIDATES'),
  ];
  const artifacts = [
    artifact('REQ-1', 'REQUIREMENT'),
    artifact('US-1', 'USER_STORY'),
    artifact('API-1', 'API'),
    artifact('DB-1', 'DATABASE'),
    artifact('QA-1', 'TEST_CASE'),
  ];
  const svc = new ImpactAnalysisService(
    fakeDepRepo(edges) as any,
    fakeArtifactRepo(artifacts) as any,
  );

  const report = await svc.analyze('p1', 'REQ-1');
  const direct = report.levels.DIRECT.map((a) => a.artifactId);
  const indirect = report.levels.INDIRECT.map((a) => a.artifactId);
  assert.deepEqual(direct, ['US-1']);
  assert.deepEqual(indirect.sort(), ['API-1', 'DB-1', 'QA-1']);
  assert.equal(report.levels.NO_IMPACT.length, 0);
  // Paths expose the concrete chain.
  const path = report.paths.find((p) => p.edges.at(-1)?.sourceArtifactId === 'DB-1');
  assert.ok(path && path.depth === 3);
});

test('impact: POTENTIAL for soft edges at depth > 1', async () => {
  const edges = [
    dep('e1', 'US-1', 'REQ-1', 'RELATED_TO'),
    dep('e2', 'DOC-1', 'US-1', 'RELATED_TO'),
  ];
  const artifacts = [artifact('REQ-1', 'REQUIREMENT'), artifact('US-1', 'USER_STORY'), artifact('DOC-1', 'DOCUMENT')];
  const svc = new ImpactAnalysisService(fakeDepRepo(edges) as any, fakeArtifactRepo(artifacts) as any);
  const report = await svc.analyze('p1', 'REQ-1');
  assert.equal(report.levels.DIRECT.length, 1);
  assert.equal(report.levels.INDIRECT.length, 0);
  assert.equal(report.levels.POTENTIAL.length, 1);
  assert.equal(report.levels.POTENTIAL[0].artifactId, 'DOC-1');
});

test('impact: NO_IMPACT when nothing depends on the artifact', async () => {
  const svc = new ImpactAnalysisService(fakeDepRepo([]) as any, fakeArtifactRepo([artifact('REQ-1', 'REQUIREMENT')]) as any);
  const report = await svc.analyze('p1', 'REQ-1');
  assert.equal(report.levels.NO_IMPACT.length, 1);
  assert.equal(report.levels.DIRECT.length, 0);
});

test('impact: missing artifact produces a warning and empty report', async () => {
  const svc = new ImpactAnalysisService(fakeDepRepo([]) as any, fakeArtifactRepo([]) as any);
  const report = await svc.analyze('p1', 'GHOST');
  assert.ok(report.warnings.some((w) => w.includes('ARTIFACT_NOT_FOUND')));
  assert.equal(report.levels.DIRECT.length, 0);
});

test('impact: invalid dependency types surface as warnings', async () => {
  const edges = [dep('e1', 'US-1', 'REQ-1', 'NONSENSE')];
  const svc = new ImpactAnalysisService(fakeDepRepo(edges) as any, fakeArtifactRepo([artifact('REQ-1', 'REQUIREMENT'), artifact('US-1', 'USER_STORY')]) as any);
  const report = await svc.analyze('p1', 'REQ-1');
  assert.ok(report.warnings.some((w) => w.includes('INVALID_DEPENDENCY_TYPES')));
});


// TODO: cover conflict-driven impact paths (CONFLICTS_WITH) once Phase 5 adds validators.
// TODO: verify that weighted impact ranking affects the returned ordering.
