import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CanonicalModelService } from './canonical-model.service';

function fakeRepo() {
  const rows: any[] = [];
  return {
    rows,
    create: (input: any) => ({ ...input }),
    save: async (row: any) => {
      const saved = { ...row, id: row.id ?? `row-${rows.length + 1}` };
      const idx = rows.findIndex((r) => r.id === saved.id);
      if (idx >= 0) rows[idx] = saved;
      else rows.push(saved);
      return saved;
    },
    findOne: async (opts: any) => {
      const where = opts?.where ?? {};
      return rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null;
    },
    find: async (opts: any) => {
      const where = opts?.where ?? {};
      return rows.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));
    },
  };
}

function requirementInput(externalId = 'FR-001') {
  return {
    externalId,
    kind: 'requirement' as const,
    title: 'User can log in',
    provenance: {
      epistemicClass: 'INFERENCE' as const,
      sources: [{ category: 'research' as const, refId: 'res-1' }],
      producedBy: 'discovery',
    },
    body: {
      classification: 'functional',
      priority: 'P0',
      actors: ['actor:user'],
      preconditions: [],
      postconditions: [],
      businessRuleRefs: [],
      acceptanceCriteriaRefs: [],
      dependencies: [],
      sourceRefs: [],
      assumptions: [],
      confidence: { value: 80 },
      validationStatus: 'UNVALIDATED',
    },
  };
}

test('ingest runs schema → normalize → business-validate → persist', async () => {
  const itemRepo = fakeRepo();
  const versionRepo = fakeRepo();
  const service = new CanonicalModelService(itemRepo as any, versionRepo as any);

  const result = await service.ingest('p1', requirementInput());
  assert.equal(result.version, 1);
  assert.equal(result.issues.length, 0);
  assert.equal(itemRepo.rows.length, 1);
  assert.equal(versionRepo.rows.length, 1);
  assert.equal(itemRepo.rows[0].payload.externalId, 'FR-001');
  assert.equal(itemRepo.rows[0].confidence, 80);
});

test('ingest rejects invalid structured output before persistence', async () => {
  const itemRepo = fakeRepo();
  const versionRepo = fakeRepo();
  const service = new CanonicalModelService(itemRepo as any, versionRepo as any);

  const bad = requirementInput('FR-002');
  (bad as any).body = { priority: 'P0' }; // missing classification
  await assert.rejects(service.ingest('p1', bad), /schema validation/);
  assert.equal(itemRepo.rows.length, 0);
  assert.equal(versionRepo.rows.length, 0);
});

test('ingest rejects blocking business validation (FACT without source)', async () => {
  const itemRepo = fakeRepo();
  const versionRepo = fakeRepo();
  const service = new CanonicalModelService(itemRepo as any, versionRepo as any);

  const input = requirementInput('FR-003');
  input.provenance = { epistemicClass: 'FACT', sources: [] } as any;
  await assert.rejects(service.ingest('p1', input), /business validation/);
  assert.equal(itemRepo.rows.length, 0);
});

test('re-ingesting the same externalId bumps the version and keeps history', async () => {
  const itemRepo = fakeRepo();
  const versionRepo = fakeRepo();
  const service = new CanonicalModelService(itemRepo as any, versionRepo as any);

  await service.ingest('p1', requirementInput('FR-004'));
  const second = requirementInput('FR-004');
  (second.body as any).priority = 'P1';
  const result = await service.ingest('p1', second);

  assert.equal(result.version, 2);
  assert.equal(itemRepo.rows.length, 1);
  assert.equal(itemRepo.rows[0].version, 2);
  assert.equal(versionRepo.rows.length, 2);
});

test('getProvenance answers "where did this requirement come from?"', async () => {
  const itemRepo = fakeRepo();
  const versionRepo = fakeRepo();
  const service = new CanonicalModelService(itemRepo as any, versionRepo as any);

  await service.ingest('p1', requirementInput('FR-005'));
  const provenance = await service.getProvenance('p1', 'requirement', 'FR-005');
  assert.ok(provenance);
  assert.equal(provenance!.epistemicClass, 'INFERENCE');
  assert.deepEqual(provenance!.sources, [{ category: 'research', refId: 'res-1' }]);
  assert.equal(provenance!.producedBy, 'discovery');
});

test('ingest can persist with advisory issues when rejectOnBlocking=false', async () => {
  const itemRepo = fakeRepo();
  const versionRepo = fakeRepo();
  const service = new CanonicalModelService(itemRepo as any, versionRepo as any);

  // FACT without source = blocking by default; with rejectOnBlocking=false
  // and persistWithIssues=true it is recorded with its issues.
  const input = requirementInput('FR-006');
  input.provenance = { epistemicClass: 'FACT', sources: [] } as any;
  const result = await service.ingest('p1', input, {
    rejectOnBlocking: false,
    persistWithIssues: true,
  });
  assert.equal(result.repaired, true);
  assert.equal(itemRepo.rows.length, 1);
});
