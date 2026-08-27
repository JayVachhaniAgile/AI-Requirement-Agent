import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KnowledgeGraphService } from './knowledge-graph.service';

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
    return list;
  }
}

function item(overrides: Partial<any> = {}) {
  const now = new Date();
  return {
    id: `i-${Math.random().toString(36).slice(2)}`,
    projectId: 'p1',
    domain: 'features',
    externalId: null,
    type: 'FEATURE',
    title: 'Item',
    body: null,
    status: 'ACTIVE',
    version: 1,
    producerAgent: 'x',
    metadata: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function edge(overrides: Partial<any> = {}) {
  return {
    id: `e-${Math.random().toString(36).slice(2)}`,
    projectId: 'p1',
    sourceId: 'a',
    targetId: 'b',
    relation: 'contains',
    weight: 1,
    producerAgent: 't',
    commitId: null,
    metadata: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeHarness() {
  const itemRepo = new FakeRepo<any>();
  const edgeRepo = new FakeRepo<any>();
  const graph = new KnowledgeGraphService(itemRepo as any, edgeRepo as any, new FakeRepo<any>() as any);
  return { graph, itemRepo, edgeRepo };
}

/** feature -> requirement -> story -> doc, plus requirement -> risk. */
function buildTraceChain(harness: ReturnType<typeof makeHarness>) {
  const { itemRepo, edgeRepo } = harness;
  itemRepo.rows.push(
    item({ id: 'feat', title: 'Payments', domain: 'features' }),
    item({ id: 'req', title: 'Pay by card', domain: 'functional_requirements' }),
    item({ id: 'story', title: 'As a user, pay by card', domain: 'user_stories' }),
    item({ id: 'risk', title: 'PCI compliance', domain: 'risks' }),
    item({ id: 'doc', title: 'FRD', domain: 'document_summaries' }),
  );
  edgeRepo.rows.push(
    edge({ sourceId: 'feat', targetId: 'req', relation: 'contains' }),
    edge({ sourceId: 'req', targetId: 'story', relation: 'elaborated_by' }),
    edge({ sourceId: 'req', targetId: 'risk', relation: 'exposes' }),
    edge({ sourceId: 'story', targetId: 'doc', relation: 'covered_by' }),
  );
}

test('getLayeredGraph groups nodes by layer and filters edges', async () => {
  const h = makeHarness();
  h.itemRepo.rows.push(
    item({ id: 'goal', domain: 'business_goals', title: 'Grow revenue' }),
    item({ id: 'feat', domain: 'features', title: 'Payments' }),
    item({ id: 'test', domain: 'test_cases', title: 'TC-1' }),
    item({ id: 'risk', domain: 'risks', title: 'PCI' }),
  );
  h.edgeRepo.rows.push(
    edge({ sourceId: 'goal', targetId: 'feat', relation: 'drives' }),
    edge({ sourceId: 'feat', targetId: 'risk', relation: 'exposes' }),
  );

  const graph = await h.graph.getLayeredGraph('p1');
  const layerMap = Object.fromEntries(graph.layers.map((l) => [l.id, l.nodes.map((n) => n.id)]));
  assert.deepEqual(layerMap.business, ['goal']);
  assert.deepEqual(layerMap.product, ['feat']);
  assert.deepEqual(layerMap.delivery, ['test']);
  assert.deepEqual(layerMap['cross-cutting'], ['risk']);
  assert.equal(graph.edges.length, 2);

  const filtered = await h.graph.getLayeredGraph('p1', ['business', 'product']);
  assert.equal(filtered.layers.length, 2);
  assert.equal(filtered.edges.length, 1, 'edge to excluded layer is dropped');
});

test('getImpactAnalysis computes forward closure with documents and risks', async () => {
  const h = makeHarness();
  buildTraceChain(h);
  const result = await h.graph.getImpactAnalysis('p1', 'feat');
  assert.equal(result.blastRadius, 4);
  assert.deepEqual(result.impacted.map((n) => n.item.id).sort(), ['doc', 'req', 'risk', 'story']);
  assert.deepEqual(result.documents.map((d) => d.id), ['doc']);
  assert.deepEqual(result.risks.map((r) => r.id), ['risk']);
  const story = result.impacted.find((n) => n.item.id === 'story');
  assert.equal(story?.distance, 2);
  assert.equal(story?.relation, 'elaborated_by');
});

test('propagate respects direction, depth, and computes severity', async () => {
  const h = makeHarness();
  buildTraceChain(h);

  const down1 = await h.graph.propagate('p1', 'feat', { direction: 'down', depth: 1 });
  assert.deepEqual(down1.impacted.map((n) => n.item.id), ['req']);

  const down3 = await h.graph.propagate('p1', 'feat', { direction: 'down', depth: 3 });
  assert.equal(down3.impacted.length, 4);
  assert.deepEqual(down3.documents.map((d) => d.id), ['doc']);
  assert.equal(down3.severity, 2, 'delivery leaf (doc) + affected document');

  const up = await h.graph.propagate('p1', 'doc', { direction: 'up', depth: 3 });
  assert.deepEqual(up.impacted.map((n) => n.item.id), ['story', 'req', 'feat']);

  const relFiltered = await h.graph.propagate('p1', 'req', { direction: 'down', depth: 3, relations: ['exposes'] });
  assert.deepEqual(relFiltered.impacted.map((n) => n.item.id), ['risk']);
});

test('getTraceabilityMatrix measures coverage and reports gaps', async () => {
  const h = makeHarness();
  h.itemRepo.rows.push(
    item({ id: 'full', domain: 'functional_requirements', title: 'Pay by card' }),
    item({ id: 'bare', domain: 'functional_requirements', title: 'Refunds' }),
    item({ id: 'story1', domain: 'user_stories', title: 'Story 1' }),
    item({ id: 'ac1', domain: 'acceptance_criteria', title: 'AC 1' }),
    item({ id: 'api1', domain: 'apis', title: 'POST /payments' }),
    item({ id: 'tbl1', domain: 'database_tables', title: 'payments' }),
    item({ id: 'scr1', domain: 'ui_screens', title: 'Checkout screen' }),
    item({ id: 'tc1', domain: 'test_cases', title: 'TC-1' }),
  );
  h.edgeRepo.rows.push(
    edge({ sourceId: 'full', targetId: 'story1', relation: 'elaborated_by' }),
    edge({ sourceId: 'story1', targetId: 'ac1', relation: 'defines' }),
    edge({ sourceId: 'full', targetId: 'api1', relation: 'implemented_by' }),
    edge({ sourceId: 'full', targetId: 'tbl1', relation: 'maps_to' }),
    edge({ sourceId: 'full', targetId: 'scr1', relation: 'rendered_by' }),
    edge({ sourceId: 'full', targetId: 'tc1', relation: 'verified_by' }),
  );

  const matrix = await h.graph.getTraceabilityMatrix('p1');
  assert.equal(matrix.summary.total, 2);
  const full = matrix.rows.find((r) => r.requirement.id === 'full');
  assert.equal(full?.coverage, 100);
  assert.equal(full?.story && full?.acceptance && full?.api && full?.dbTable && full?.uiScreen && full?.testCase, true);
  const bare = matrix.rows.find((r) => r.requirement.id === 'bare');
  assert.equal(bare?.coverage, 0);
  const gap = matrix.summary.gaps.find((g) => g.itemId === 'bare');
  assert.equal(gap?.missing.length, 6);
  assert.ok(matrix.summary.averageCoverage > 0);
});

test('getConflictPairs returns conflicts_with pairs with item details', async () => {
  const h = makeHarness();
  h.itemRepo.rows.push(
    item({ id: 'a', title: 'Email auth', domain: 'functional_requirements' }),
    item({ id: 'b', title: 'SSO only', domain: 'functional_requirements' }),
    item({ id: 'c', title: 'OTP', domain: 'functional_requirements' }),
  );
  h.edgeRepo.rows.push(
    edge({ sourceId: 'a', targetId: 'b', relation: 'conflicts_with', metadata: JSON.stringify({ reason: 'overlapping auth flows' }) }),
    edge({ sourceId: 'a', targetId: 'c', relation: 'depends_on' }),
  );

  const pairs = await h.graph.getConflictPairs('p1');
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].source.title, 'Email auth');
  assert.equal(pairs[0].target.title, 'SSO only');
  assert.equal(pairs[0].relation, 'conflicts_with');
  assert.equal(pairs[0].reason?.['reason'], 'overlapping auth flows');
});

test('relationshipSearch annotates hits with 1-hop relations', async () => {
  const h = makeHarness();
  h.itemRepo.rows.push(
    item({ id: 'req', title: 'Pay by card', body: 'Card payments', domain: 'functional_requirements' }),
    item({ id: 'api1', title: 'POST /payments', body: 'API endpoint', domain: 'apis' }),
    item({ id: 'tc1', title: 'TC-1', body: 'Test card payment', domain: 'test_cases' }),
  );
  h.edgeRepo.rows.push(
    edge({ sourceId: 'req', targetId: 'api1', relation: 'implemented_by' }),
    edge({ sourceId: 'req', targetId: 'tc1', relation: 'verified_by' }),
  );
  const result = await h.graph.relationshipSearch('p1', 'card');
  assert.ok(result.items.length >= 1);
  const req = result.items.find((i) => i.id === 'req');
  assert.ok(req, 'keyword-matched requirement present');
  assert.ok(req.relations.some((r) => r.relation === 'implemented_by' && r.direction === 'out'));
  assert.ok(req.relations.some((r) => r.other.title === 'POST /payments'));
});
