import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArtifactRegistryService } from './artifact-registry.service';

function fakeRepo() {
  const rows: any[] = [];
  return {
    rows,
    create: (input: any) => ({ ...input }),
    save: async (row: any) => {
      const saved = { ...row, id: row.id ?? `id-${rows.length + 1}` };
      const idx = rows.findIndex((r) => r.id === saved.id);
      if (idx >= 0) rows[idx] = saved;
      else rows.push(saved);
      return saved;
    },
    find: async (opts: any) => {
      if (!opts?.where) return rows;
      const where = opts.where;
      return rows.filter((r) =>
        Object.entries(where).every(([k, v]) => r[k] === v),
      );
    },
    findOne: async (opts: any) => {
      const list = await fakeRepoFind(rows, opts?.where);
      return list[0] ?? null;
    },
    update: async () => undefined,
  };
}

async function fakeRepoFind(rows: any[], where?: any) {
  if (!where) return rows;
  return rows.filter((r) =>
    Object.entries(where).every(([k, v]) => r[k] === v),
  );
}

test('ArtifactRegistryService.upsertArtifact creates version 1 with history', async () => {
  const artifactRepo = fakeRepo();
  const versionRepo = fakeRepo();
  const depRepo = fakeRepo();
  const service = new ArtifactRegistryService(
    artifactRepo as any,
    versionRepo as any,
    depRepo as any,
  );

  const artifact = await service.upsertArtifact({
    projectId: 'p1',
    type: 'FRD_DOCUMENT',
    key: 'frd',
    title: 'Functional Requirements',
    content: '# FRD',
    source: 'frd',
    createdBy: 'user',
  });

  assert.equal(artifact.version, 1);
  assert.equal(artifactRepo.rows.length, 1);
  assert.equal(versionRepo.rows.length, 1);
  assert.equal(versionRepo.rows[0].version, 1);
});

test('ArtifactRegistryService.publishNewVersion bumps artifact + history', async () => {
  const artifactRepo = fakeRepo();
  const versionRepo = fakeRepo();
  const depRepo = fakeRepo();
  const service = new ArtifactRegistryService(
    artifactRepo as any,
    versionRepo as any,
    depRepo as any,
  );

  const artifact = await service.upsertArtifact({
    projectId: 'p1',
    type: 'FRD_DOCUMENT',
    key: 'frd',
    title: 'Functional Requirements',
    content: 'v1 content',
    createdBy: 'user',
  });
  const v2 = await service.publishNewVersion(artifact.id, {
    content: 'v2 content',
    createdBy: 'compiler',
  });

  assert.equal(v2.version, 2);
  assert.equal(v2.content, 'v2 content');
  assert.equal(versionRepo.rows.length, 2);
  assert.equal(versionRepo.rows[1].version, 2);
});

test('ArtifactRegistryService.addDependency rejects cycles', async () => {
  const artifactRepo = fakeRepo();
  const versionRepo = fakeRepo();
  const depRepo = fakeRepo();
  await artifactRepo.save({
    id: 'a',
    projectId: 'p1',
    type: 'X',
    key: null,
    title: null,
    summary: null,
    content: null,
    status: 'DRAFT',
    version: 1,
    source: null,
    sourceVersion: null,
    createdBy: null,
    confidence: null,
    metadata: null,
  });
  await artifactRepo.save({
    id: 'b',
    projectId: 'p1',
    type: 'Y',
    key: null,
    title: null,
    summary: null,
    content: null,
    status: 'DRAFT',
    version: 1,
    source: null,
    sourceVersion: null,
    createdBy: null,
    confidence: null,
    metadata: null,
  });

  const service = new ArtifactRegistryService(
    artifactRepo as any,
    versionRepo as any,
    depRepo as any,
  );
  await service.addDependency({
    sourceArtifactId: 'a',
    targetArtifactId: 'b',
    relation: 'depends_on',
  });
  await assert.rejects(
    service.addDependency({
      sourceArtifactId: 'b',
      targetArtifactId: 'a',
      relation: 'depends_on',
    }),
    /cycle/,
  );
});
