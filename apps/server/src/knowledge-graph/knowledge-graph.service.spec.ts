import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KnowledgeGraphService,
  cosineSimilarity,
} from './knowledge-graph.service';

interface AnyRow {
  id: string;
  [key: string]: unknown;
}

class FakeRepo<T extends AnyRow> {
  rows: T[] = [];

  create(entity: Partial<T>): T {
    return entity as T;
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

  async delete(criteria: Partial<T>): Promise<{ affected: number }> {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => !Object.entries(criteria).every(([k, v]) => row[k] === v));
    return { affected: before - this.rows.length };
  }

  async findOne(options: any): Promise<T | null> {
    const list = await this.find(options);
    return list[0] ?? null;
  }

  async find(options: any): Promise<T[]> {
    let list = [...this.rows];
    const where = options?.where ?? {};
    for (const [key, rawValue] of Object.entries(where)) {
      let value = rawValue;
      let op = 'eq';
      if (rawValue && typeof rawValue === 'object' && (rawValue as any)._type) {
        op = (rawValue as any)._type;
        value = (rawValue as any)._value;
      }
      list = list.filter((row) => {
        if (op === 'in') {
          const values = value as unknown[];
          return Array.isArray(row[key])
            ? values.some((v) => (row[key] as unknown[]).includes(v))
            : values.includes(row[key]);
        }
        if (op === 'not') return row[key] !== value;
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
}

function item(overrides: Partial<any> = {}) {
  const now = new Date();
  return {
    id: `item-${Math.random().toString(36).slice(2)}`,
    projectId: 'p1',
    domain: 'features',
    externalId: null,
    type: 'FEATURE',
    title: 'Checkout',
    body: 'A checkout flow',
    status: 'ACTIVE',
    version: 1,
    producerAgent: 'product-analysis',
    metadata: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function edge(overrides: Partial<any> = {}) {
  return {
    id: `edge-${Math.random().toString(36).slice(2)}`,
    projectId: 'p1',
    sourceId: 'a',
    targetId: 'b',
    relation: 'contains',
    weight: 1,
    producerAgent: 'test',
    commitId: null,
    metadata: null,
    createdAt: new Date(),
    ...overrides,
  };
}

interface Harness {
  graph: KnowledgeGraphService;
  itemRepo: FakeRepo<any>;
  edgeRepo: FakeRepo<any>;
}

function makeHarness(): Harness {
  const itemRepo = new FakeRepo<any>();
  const edgeRepo = new FakeRepo<any>();
  const embedRepo = new FakeRepo<any>();
  const graph = new KnowledgeGraphService(itemRepo as any, edgeRepo as any, embedRepo as any);
  return { graph, itemRepo, edgeRepo };
}

test('assertEdges creates valid edges and upserts duplicates', async () => {
  const { graph, itemRepo } = makeHarness();
  const a = item({ id: 'a', title: 'Checkout' });
  const b = item({ id: 'b', title: 'Payments' });
  itemRepo.rows.push(a, b);

  const first = await graph.assertEdges('p1', [{ sourceId: 'a', targetId: 'b', relation: 'contains' }], { key: 'test-agent' });
  assert.equal(first.created, 1);
  assert.equal(first.updated, 0);
  assert.equal(first.edges[0].producerAgent, 'test-agent');

  const second = await graph.assertEdges('p1', [{ sourceId: 'a', targetId: 'b', relation: 'contains', weight: 2 }], { key: 'test-agent' });
  assert.equal(second.created, 0);
  assert.equal(second.updated, 1);
  assert.equal(second.edges[0].weight, 2);
});

test('assertEdges rejects unknown relations and missing endpoints', async () => {
  const { graph, itemRepo } = makeHarness();
  itemRepo.rows.push(item({ id: 'a' }), item({ id: 'b' }));
  await assert.rejects(
    () => graph.assertEdges('p1', [{ sourceId: 'a', targetId: 'b', relation: 'nope' }], { key: 'x' }),
    /unknown relation/,
  );
  await assert.rejects(
    () => graph.assertEdges('p1', [{ sourceId: 'a', targetId: 'missing', relation: 'contains' }], { key: 'x' }),
    /must exist in project/,
  );
});

test('removeEdge deletes and 404s on repeat', async () => {
  const { graph, edgeRepo } = makeHarness();
  const e = edge({ id: 'e1' });
  edgeRepo.rows.push(e);
  const result = await graph.removeEdge('p1', 'e1');
  assert.equal(result.removed, true);
  assert.equal(edgeRepo.rows.length, 0);
  await assert.rejects(() => graph.removeEdge('p1', 'e1'), /not found/i);
});

test('getNeighbors walks the graph to the requested depth', async () => {
  const { graph, itemRepo, edgeRepo } = makeHarness();
  itemRepo.rows.push(item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' }));
  edgeRepo.rows.push(edge({ sourceId: 'a', targetId: 'b', relation: 'contains' }));
  edgeRepo.rows.push(edge({ sourceId: 'b', targetId: 'c', relation: 'depends_on' }));

  const depth1 = await graph.getNeighbors('p1', 'a', { depth: 1 });
  assert.deepEqual(depth1.neighbors.map((n) => n.node.id).sort(), ['b']);

  const depth2 = await graph.getNeighbors('p1', 'a', { depth: 2 });
  assert.deepEqual(depth2.neighbors.map((n) => n.node.id).sort(), ['b', 'c']);
  const cEntry = depth2.neighbors.find((n) => n.node.id === 'c');
  assert.equal(cEntry?.distance, 2);

  const filtered = await graph.getNeighbors('p1', 'b', { depth: 2, relation: 'depends_on' });
  assert.deepEqual(filtered.neighbors.map((n) => n.node.id), ['c']);
});

test('trace returns ancestors (up) and descendants (down)', async () => {
  const { graph, itemRepo, edgeRepo } = makeHarness();
  itemRepo.rows.push(item({ id: 'goal' }), item({ id: 'feat' }), item({ id: 'story' }));
  edgeRepo.rows.push(edge({ sourceId: 'feat', targetId: 'goal', relation: 'satisfies' }));
  edgeRepo.rows.push(edge({ sourceId: 'story', targetId: 'feat', relation: 'satisfies' }));

  const result = await graph.trace('p1', 'feat');
  assert.deepEqual(result.up.map((n) => n.node.id), ['story']);
  assert.deepEqual(result.down.map((n) => n.node.id), ['goal']);
});

test('retrieve ranks keyword matches and graph neighbors, skips SUPERSEDED', async () => {
  const { graph, itemRepo, edgeRepo } = makeHarness();
  const now = Date.now();
  const a = item({ id: 'a', title: 'Checkout flow', body: 'A checkout flow', updatedAt: new Date(now + 10) });
  const b = item({ id: 'b', title: 'Payments', body: 'Card payment processing', domain: 'features', updatedAt: new Date(now) });
  const c = item({ id: 'c', title: 'PCI compliance', body: 'Security compliance risks', domain: 'risks', updatedAt: new Date(now - 10) });
  const old = item({ id: 'old', title: 'Checkout flow v0', body: 'Legacy checkout', status: 'SUPERSEDED', updatedAt: new Date(now - 20) });
  itemRepo.rows.push(a, b, c, old);
  edgeRepo.rows.push(edge({ sourceId: 'a', targetId: 'b', relation: 'contains' }));

  const { items } = await graph.retrieve('p1', 'checkout', { depth: 1 });
  assert.ok(!items.some((i) => i.id === 'old'), 'SUPERSEDED items must be excluded');
  assert.equal(items[0].id, 'a', 'keyword match ranks first');
  assert.ok(items[0].matchedBy.includes('keyword'));
  const bItem = items.find((i) => i.id === 'b');
  assert.ok(bItem && bItem.matchedBy.includes('graph'), 'neighbor boosted via graph');
  assert.ok(bItem && bItem.score > 0);
});

test('retrieve respects maxItems and domain filter', async () => {
  const { graph, itemRepo } = makeHarness();
  itemRepo.rows.push(item({ id: 'a', title: 'X', domain: 'features' }));
  itemRepo.rows.push(item({ id: 'b', title: 'X', domain: 'risks' }));

  const one = await graph.retrieve('p1', 'x', { maxItems: 1 });
  assert.equal(one.items.length, 1);

  const featuresOnly = await graph.retrieve('p1', '', { domains: ['features'] });
  assert.deepEqual(featuresOnly.items.map((i) => i.id), ['a']);
});

test('getDigestForConsumer returns knowledge summaries', async () => {
  const { graph, itemRepo } = makeHarness();
  itemRepo.rows.push(item({ id: 'a', title: 'Checkout', externalId: 'FEAT-1', body: 'flow' }));
  const summaries = await graph.getDigestForConsumer('p1', 'requirements-engineering');
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].externalId, 'FEAT-1');
  assert.equal(summaries[0].title, 'Checkout');
});

test('renderDocument groups items by domain and counts traceable nodes', async () => {
  const { graph, itemRepo, edgeRepo } = makeHarness();
  itemRepo.rows.push(
    item({ id: 'a', title: 'Checkout', domain: 'features' }),
    item({ id: 'b', title: 'Payments', domain: 'features' }),
    item({ id: 'c', title: 'PCI', domain: 'risks' }),
  );
  edgeRepo.rows.push(edge({ sourceId: 'a', targetId: 'c', relation: 'exposes' }));

  const doc = await graph.renderDocument('p1', 'FRD_DOCUMENT');
  assert.equal(doc.documentType, 'FRD_DOCUMENT');
  assert.equal(doc.items.features.length, 2);
  assert.equal(doc.items.risks.length, 1);
  assert.equal(doc.edges.length, 1);
  assert.equal(doc.traceableItemCount, 2);
});

test('cosineSimilarity is deterministic', () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.ok(cosineSimilarity([1, 2, 3], [1, 2, 3]) > 0.999);
  assert.equal(cosineSimilarity([], []), 0);
  assert.equal(cosineSimilarity([1, 2], [1]), 0);
});
