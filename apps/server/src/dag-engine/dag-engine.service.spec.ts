import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DagEngineService } from './dag-engine.service';
import { DagEventsService } from './dag-events.service';
import { NodeExecutorRegistry } from './node-executor.registry';
import { DAG_DEFINITIONS } from './pipeline.dag';
import type {
  NodeExecutionContext,
  NodeExecutionResult,
  WorkflowDagDefinition,
} from './types';

interface AnyRow {
  id: string;
  [key: string]: unknown;
}

/** Minimal in-memory TypeORM-repo stand-in (matching existing spec patterns). */
class FakeRepo<T extends AnyRow> {
  rows: T[] = [];

  create(entity: Partial<T>): T {
    return entity as T;
  }

  async update(idOrWhere: string | Record<string, unknown>, patch: Partial<T>): Promise<void> {
    const where: Record<string, unknown> =
      typeof idOrWhere === 'string' ? { id: idOrWhere } : (idOrWhere as Record<string, unknown>);
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      let match = true;
      for (const [k, v] of Object.entries(where)) {
        if ((row as any)[k] !== v) {
          match = false;
          break;
        }
      }
      if (match) {
        this.rows[i] = { ...row, ...patch, id: (row as any).id } as T;
        return;
      }
    }
  }

  async save(entity: T | T[]): Promise<T | T[]> {
    if (Array.isArray(entity)) {
      for (const row of entity) await this.save(row);
      return entity;
    }
    const idx = this.rows.findIndex((r) => r.id === entity.id);
    if (idx >= 0) this.rows[idx] = { ...this.rows[idx], ...entity };
    else this.rows.push({ ...entity });
    return entity;
  }

  async findOne(options: any): Promise<T | null> {
    const list = await this.find(options);
    return list[0] ?? null;
  }

  async find(options: any): Promise<T[]> {
    let list = [...this.rows];
    const where = options?.where ?? {};
    for (const [key, rawValue] of Object.entries(where)) {
      // TypeORM FindOperator from In(...) has { _type: 'in', _value: [...] }.
      const value =
        rawValue && typeof rawValue === 'object' && (rawValue as any)._type === 'in'
          ? (rawValue as any)._value
          : rawValue;
      list = list.filter((row) => {
        if (Array.isArray(value)) {
          return Array.isArray(row[key])
            ? (value as unknown[]).some((v) => (row[key] as unknown[]).includes(v))
            : (value as unknown[]).includes(row[key]);
        }
        return row[key] === value;
      });
    }
    if (options?.order) {
      const [key, dir] = Object.entries(options.order)[0] as [string, string];
      list.sort((a, b) => {
        const av = a[key] as number;
        const bv = b[key] as number;
        return dir === 'DESC' ? bv - av : av - bv;
      });
    }
    return list;
  }

  async upsert(entity: T, keys: string[]): Promise<void> {
    const idx = this.rows.findIndex((r) => keys.every((k) => r[k] === entity[k]));
    if (idx >= 0) this.rows[idx] = { ...this.rows[idx], ...entity };
    else this.rows.push({ ...entity });
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function registerTestDag(key: string, dag: WorkflowDagDefinition) {
  (DAG_DEFINITIONS as Record<string, WorkflowDagDefinition>)[key] = dag;
}

function unregisterTestDag(key: string) {
  delete (DAG_DEFINITIONS as Record<string, WorkflowDagDefinition>)[key];
}

interface Harness {
  engine: DagEngineService;
  registry: NodeExecutorRegistry;
  nodeRepo: FakeRepo<any>;
  runRepo: FakeRepo<any>;
  projectRepo: FakeRepo<any>;
}

function makeHarness(concurrency = 2): Harness {
  const defRepo = new FakeRepo<any>();
  const runRepo = new FakeRepo<any>();
  const nodeRepo = new FakeRepo<any>();
  const projectRepo = new FakeRepo<any>();
  const stepRepo = new FakeRepo<any>();
  const registry = new NodeExecutorRegistry();
  const events = new DagEventsService();
  const rkb = {
    deleteKnowledgeByCreatedBy: async () => undefined,
    deleteDocument: async () => undefined,
    deleteValidationIssues: async () => undefined,
    resetPipelineArtifacts: async () => undefined,
  };
  const engine = new DagEngineService(
    defRepo as any,
    runRepo as any,
    nodeRepo as any,
    projectRepo as any,
    stepRepo as any,
    registry,
    events,
    rkb as any,
    concurrency,
  );
  return { engine, registry, nodeRepo, runRepo, projectRepo };
}

function simpleDag(key: string): WorkflowDagDefinition {
  return {
    key,
    name: key,
    nodes: [
      { key: 'a' },
      { key: 'b' },
      { key: 'c' },
    ],
    edges: [
      { from: 'a', to: 'c' },
      { from: 'b', to: 'c' },
    ],
  };
}

test('executes independent nodes in parallel and waits for dependencies', async () => {
  const key = 'dag-spec-parallel';
  registerTestDag(key, simpleDag(key));
  const { engine, registry } = makeHarness();
  const active = { count: 0, max: 0 };
  registry.registerMany({
    a: async () => {
      active.count++;
      active.max = Math.max(active.max, active.count);
      await delay(30);
      active.count--;
      return { success: true, output: { fromA: true } };
    },
    b: async () => {
      active.count++;
      active.max = Math.max(active.max, active.count);
      await delay(30);
      active.count--;
      return { success: true, output: { fromB: true } };
    },
    c: async (ctx) => {
      assert.ok(ctx.deps.a, 'c must receive output of a');
      assert.ok(ctx.deps.b, 'c must receive output of b');
      return { success: true, output: { done: true } };
    },
  });

  const state = await engine.startRun('project-1', key);
  assert.equal(state.run.status, 'COMPLETED');
  assert.ok(active.max >= 2, `expected a and b to run in parallel (max=${active.max})`);
  const byKey = Object.fromEntries(state.nodes.map((n) => [n.nodeKey, n]));
  assert.equal(byKey.a.status, 'COMPLETED');
  assert.equal(byKey.b.status, 'COMPLETED');
  assert.equal(byKey.c.status, 'COMPLETED');
  unregisterTestDag(key);
});

test('retries failed nodes up to maxRetries then fails the run', async () => {
  const key = 'dag-spec-retry';
  registerTestDag(key, {
    ...simpleDag(key),
    nodes: [{ key: 'a' }, { key: 'b' }, { key: 'c' }],
  });
  const { engine, registry } = makeHarness();
  registry.registerMany({
    a: async () => ({ success: true, output: {} }),
    b: async () => {
      throw new Error('boom');
    },
    c: async () => ({ success: true, output: {} }),
  });

  const state = await engine.startRun('project-1', key);
  assert.equal(state.run.status, 'FAILED');
  const byKey = Object.fromEntries(state.nodes.map((n) => [n.nodeKey, n]));
  assert.equal(byKey.b.status, 'FAILED');
  assert.equal(byKey.b.retryCount, 2, 'two retries after first attempt');
  assert.equal(byKey.b.error, 'boom');
  assert.equal(byKey.c.status, 'PENDING', 'downstream node not started after the failed layer');
  unregisterTestDag(key);
});

test('checkpoint node pauses the run until human approval', async () => {
  const key = 'dag-spec-checkpoint';
  registerTestDag(key, {
    key,
    name: key,
    nodes: [{ key: 'approve', checkpoint: true }, { key: 'after' }],
    edges: [{ from: 'approve', to: 'after' }],
  });
  const { engine, registry } = makeHarness();
  registry.registerMany({
    approve: async () => ({ success: true, output: { plan: 'ok' } }),
    after: async () => ({ success: true, output: { finished: true } }),
  });

  const state = await engine.startRun('project-1', key);
  assert.equal(state.run.status, 'WAITING_APPROVAL');
  const byKey = Object.fromEntries(state.nodes.map((n) => [n.nodeKey, n]));
  assert.equal(byKey.approve.status, 'WAITING_APPROVAL');
  assert.equal(byKey.after.status, 'PENDING', 'dependent waits for approval');

  const resumed = await engine.approveCheckpoint(state.run.id, 'approve');
  assert.equal(resumed.run.status, 'COMPLETED');
  assert.equal(resumed.nodes.find((n) => n.nodeKey === 'after')?.status, 'COMPLETED');
  unregisterTestDag(key);
});

test('skipping an optional node cascades to optional dependents', async () => {
  const key = 'dag-spec-skip';
  registerTestDag(key, {
    key,
    name: key,
    nodes: [
      { key: 'root', optional: true },
      { key: 'leaf', optional: true },
    ],
    edges: [{ from: 'root', to: 'leaf' }],
  });
  const { engine, registry } = makeHarness();
  registry.registerMany({
    root: async () => ({ success: true, output: {} }),
    leaf: async () => ({ success: true, output: {} }),
  });

  const state = await engine.startRun('project-1', key);
  assert.equal(state.run.status, 'COMPLETED');
  const byKey = Object.fromEntries(state.nodes.map((n) => [n.nodeKey, n]));
  assert.equal(byKey.root.status, 'COMPLETED');

  // Restart to demonstrate an explicit skip.
  const state2 = await engine.startRun('project-1', key);
  const runId = state2.run.id;
  const afterSkip = await engine.skipNode(runId, 'root');
  assert.equal(afterSkip.nodes.find((n) => n.nodeKey === 'root')?.status, 'SKIPPED');
  assert.equal(afterSkip.nodes.find((n) => n.nodeKey === 'leaf')?.status, 'SKIPPED');
  assert.equal(afterSkip.run.status, 'COMPLETED');
  unregisterTestDag(key);
});

test('required nodes cannot be skipped', async () => {
  const key = 'dag-spec-noskip';
  registerTestDag(key, simpleDag(key));
  const { engine, registry } = makeHarness();
  registry.registerMany({
    a: async () => ({ success: true, output: {} }),
    b: async () => ({ success: true, output: {} }),
    c: async () => ({ success: true, output: {} }),
  });
  const state = await engine.startRun('project-1', key);
  await assert.rejects(() => engine.skipNode(state.run.id, 'a'), /required/);
  unregisterTestDag(key);
});

test('resume re-runs the failed node and its descendants', async () => {
  const key = 'dag-spec-resume';
  registerTestDag(key, {
    key,
    name: key,
    nodes: [{ key: 'a' }, { key: 'b' }, { key: 'c' }],
    edges: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ],
  });
  const { engine, registry } = makeHarness();
  let bRuns = 0;
  let cRuns = 0;
  registry.registerMany({
    a: async () => ({ success: true, output: {} }),
    b: async () => {
      bRuns++;
      if (bRuns <= 3) return { success: false, error: 'transient failure' };
      return { success: true, output: {} };
    },
    c: async () => {
      cRuns++;
      return { success: true, output: {} };
    },
  });

  const failed = await engine.startRun('project-1', key);
  assert.equal(failed.run.status, 'FAILED');
  assert.equal(cRuns, 0, 'c never ran while b was failing');

  const resumed = await engine.resume(failed.run.id);
  assert.equal(resumed.run.status, 'COMPLETED');
  assert.equal(bRuns, 4, 'b re-ran after resume (3 failed attempts + success)');
  assert.equal(cRuns, 1, 'c ran once after its dependency recovered');
  unregisterTestDag(key);
});

test('pause stops between levels; resume continues', async () => {
  const key = 'dag-spec-pause';
  registerTestDag(key, {
    key,
    name: key,
    nodes: [{ key: 'first' }, { key: 'second' }],
    edges: [{ from: 'first', to: 'second' }],
  });
  const { engine, registry, runRepo } = makeHarness();
  registry.registerMany({
    first: async () => {
      await delay(40);
      return { success: true, output: {} };
    },
    second: async () => ({ success: true, output: {} }),
  });

  const promise = engine.startRun('project-1', key);
  await delay(10); // let the run row be created and level 0 start
  const runId = runRepo.rows[0].id;
  await engine.pause(runId);
  await promise;
  const paused = await engine.getRunState(runId);
  assert.equal(paused.run.status, 'PAUSED');

  const resumed = await engine.resume(runId);
  assert.equal(resumed.run.status, 'COMPLETED');
  unregisterTestDag(key);
});

test('concurrency cap limits simultaneous node execution', async () => {
  const key = 'dag-spec-cap';
  const dag: WorkflowDagDefinition = {
    key,
    name: key,
    nodes: [{ key: 'n1' }, { key: 'n2' }, { key: 'n3' }, { key: 'n4' }],
    edges: [],
  };
  registerTestDag(key, dag);
  const { engine, registry } = makeHarness(2);
  const active = { count: 0, max: 0 };
  registry.registerMany(
    Object.fromEntries(
      ['n1', 'n2', 'n3', 'n4'].map((k) => [
        k,
        async () => {
          active.count++;
          active.max = Math.max(active.max, active.count);
          await delay(20);
          active.count--;
          return { success: true, output: {} };
        },
      ]),
    ),
  );
  const state = await engine.startRun('project-1', key);
  assert.equal(state.run.status, 'COMPLETED');
  assert.ok(active.max <= 2, `concurrency cap respected (max=${active.max})`);
  assert.ok(active.max >= 2, 'still executes a full batch in parallel');
  unregisterTestDag(key);
});

test('unregistered executors fail the node with a clear error', async () => {
  const key = 'dag-spec-unwired';
  registerTestDag(key, simpleDag(key));
  const { engine, registry } = makeHarness();
  registry.registerMany({
    a: async () => ({ success: true, output: {} }),
    b: async () => ({ success: true, output: {} }),
    // c intentionally not registered
  });
  const state = await engine.startRun('project-1', key);
  assert.equal(state.run.status, 'FAILED');
  const cNode = state.nodes.find((n) => n.nodeKey === 'c');
  assert.equal(cNode?.status, 'FAILED');
  assert.ok(String(cNode?.error).includes('No executor registered'));
  unregisterTestDag(key);
});
