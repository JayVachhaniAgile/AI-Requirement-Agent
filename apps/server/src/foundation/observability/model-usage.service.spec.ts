import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ModelUsageService } from './model-usage.service';

function fakeRepo() {
  const rows: any[] = [];
  return {
    rows,
    create: (input: any) => ({ ...input }),
    save: async (row: any) => {
      const saved = { id: `u-${rows.length + 1}`, createdAt: new Date(), ...row };
      rows.push(saved);
      return saved;
    },
    find: async (opts: any) =>
      opts?.where?.projectId
        ? rows.filter((r) => r.projectId === opts.where.projectId)
        : rows,
  };
}

test('ModelUsageService.record persists rows with computed cost', async () => {
  const repo = fakeRepo();
  const service = new ModelUsageService(repo as any);
  const row = await service.record({
    projectId: 'p1',
    skillKey: 'requirements-engineering',
    model: 'gpt-4o',
    inputTokens: 1_000_000,
    outputTokens: 100_000,
  });
  assert.equal(row.estimatedCostUsd, 3.5);
  assert.equal(row.projectId, 'p1');
});

test('ModelUsageService.summarize aggregates totals by model and skill', async () => {
  const repo = fakeRepo();
  const service = new ModelUsageService(repo as any);
  await service.record({
    projectId: 'p1',
    skillKey: 'discovery',
    model: 'gpt-4o',
    inputTokens: 1000,
    outputTokens: 500,
  });
  await service.record({
    projectId: 'p1',
    skillKey: 'research',
    model: 'gpt-4o',
    inputTokens: 2000,
    outputTokens: 300,
  });
  await service.record({
    projectId: 'p1',
    skillKey: 'research',
    model: 'gpt-4o-mini',
    inputTokens: 500,
    outputTokens: 100,
  });

  const summary = await service.summarize('p1');
  assert.equal(summary.totalInputTokens, 3500);
  assert.equal(summary.totalOutputTokens, 900);
  assert.equal(summary.byModel['gpt-4o'].input, 3000);
  assert.equal(summary.byModel['gpt-4o-mini'].input, 500);
  assert.equal(summary.bySkill['research'].input, 2500);
  assert.equal(summary.bySkill.discovery.input, 1000);
});

test('ModelUsageService.summarize handles empty project', async () => {
  const service = new ModelUsageService(fakeRepo() as any);
  const summary = await service.summarize('missing');
  assert.equal(summary.totalInputTokens, 0);
  assert.equal(summary.totalCostUsd, 0);
  assert.deepEqual(summary.byModel, {});
});
