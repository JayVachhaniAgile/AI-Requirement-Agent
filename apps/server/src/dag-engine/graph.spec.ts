import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDag, descendantsOf, generatePlan, levelOf } from './graph';
import { CRYSTALLIZE_PIPELINE_DAG, SANITY_DAG } from './pipeline.dag';
import type { WorkflowDagDefinition } from './types';

test('sanity DAG layers allow parallel nodes', () => {
  const { layers, order, cycles } = analyzeDag(SANITY_DAG);
  assert.deepEqual(cycles, []);
  assert.deepEqual(layers, [
    ['sanity-discovery'],
    ['sanity-research'],
    ['sanity-business-analysis', 'sanity-product-analysis'],
    ['sanity-requirements-engineering'],
  ]);
  assert.equal(order.length, 5);
});

test('plan metadata captures optional/checkpoint/dependencies', () => {
  const plan = generatePlan(SANITY_DAG);
  assert.equal(plan.nodeMeta['sanity-discovery'].checkpoint, true);
  assert.equal(plan.nodeMeta['sanity-product-analysis'].optional, true);
  assert.deepEqual(plan.nodeMeta['sanity-requirements-engineering'].dependsOn, [
    'sanity-business-analysis',
    'sanity-product-analysis',
  ]);
});

test('cycle detection reports remaining nodes', () => {
  const cyclic: WorkflowDagDefinition = {
    key: 'test:cycle',
    name: 'Cycle',
    nodes: [
      { key: 'a' },
      { key: 'b' },
    ],
    edges: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'a' },
    ],
  };
  const { cycles } = analyzeDag(cyclic);
  assert.equal(cycles.length, 1);
  assert.deepEqual(new Set(cycles[0]), new Set(['a', 'b']));
  assert.throws(() => generatePlan(cyclic), /cycle/i);
});

test('edges referencing unknown nodes throw', () => {
  const bad: WorkflowDagDefinition = {
    key: 'test:bad-edge',
    name: 'Bad',
    nodes: [{ key: 'a' }],
    edges: [{ from: 'a', to: 'missing' }],
  };
  assert.throws(() => analyzeDag(bad), /unknown node/i);
});

test('descendantsOf returns the transitive closure', () => {
  const deps = descendantsOf(SANITY_DAG, 'sanity-discovery');
  assert.deepEqual(new Set(deps), new Set([
    'sanity-research',
    'sanity-business-analysis',
    'sanity-product-analysis',
    'sanity-requirements-engineering',
  ]));
});

test('levelOf finds a node layer index', () => {
  const plan = generatePlan(SANITY_DAG);
  assert.equal(levelOf(plan, 'sanity-requirements-engineering'), 3);
  assert.throws(() => levelOf(plan, 'nope'), /not found/i);
});

test('pipeline DAG runs the six document generators in parallel', () => {
  const plan = generatePlan(CRYSTALLIZE_PIPELINE_DAG);
  const docs = ['frd', 'user-stories', 'tech-arch', 'db-design', 'api-spec', 'sow'];
  const docLayer = plan.layers.find((layer) => layer.includes('frd'));
  assert.ok(docLayer, 'doc layer exists');
  for (const doc of docs) {
    assert.ok(docLayer.includes(doc), `${doc} must be in the parallel doc layer`);
  }
  // Gap analysis must run strictly after every document generator.
  const gapLevel = levelOf(plan, 'gap-analysis');
  assert.ok(gapLevel > plan.layers.indexOf(docLayer));
});

test('pipeline DAG is acyclic and has 23 nodes', () => {
  const { cycles } = analyzeDag(CRYSTALLIZE_PIPELINE_DAG);
  assert.deepEqual(cycles, []);
  assert.equal(CRYSTALLIZE_PIPELINE_DAG.nodes.length, 23);
});
