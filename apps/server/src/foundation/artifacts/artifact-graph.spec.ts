import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAdjacency,
  layerGraph,
  reachableDownstream,
  reachableUpstream,
  wouldCreateCycle,
  type ArtifactEdge,
} from './artifact-graph';

function edge(
  id: string,
  sourceArtifactId: string,
  targetArtifactId: string,
): ArtifactEdge {
  return { id, projectId: 'p1', sourceArtifactId, targetArtifactId, relation: 'depends_on', weight: 1 };
}

test('buildAdjacency indexes outgoing and incoming edges', () => {
  const edges = [
    edge('e1', 'a', 'b'),
    edge('e2', 'a', 'c'),
    edge('e3', 'b', 'c'),
  ];
  const adj = buildAdjacency(edges);
  assert.deepEqual(adj.outgoing.get('a'), ['e1', 'e2']);
  assert.deepEqual(adj.incoming.get('c'), ['e2', 'e3']);
});

test('reachableDownstream follows outgoing edges depth-bounded', () => {
  const edges = [
    edge('e1', 'a', 'b'),
    edge('e2', 'b', 'c'),
    edge('e3', 'c', 'd'),
  ];
  assert.deepEqual([...reachableDownstream(edges, 'a')].sort(), ['b', 'c', 'd']);
  assert.deepEqual([...reachableDownstream(edges, 'a', 1)].sort(), ['b']);
  assert.deepEqual([...reachableDownstream(edges, 'd')], []);
});

test('reachableUpstream follows incoming edges', () => {
  const edges = [
    edge('e1', 'a', 'b'),
    edge('e2', 'b', 'c'),
  ];
  assert.deepEqual([...reachableUpstream(edges, 'c')].sort(), ['a', 'b']);
});

test('wouldCreateCycle detects self and transitive cycles', () => {
  const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')];
  assert.equal(wouldCreateCycle(edges, 'a', 'a'), true);
  assert.equal(wouldCreateCycle(edges, 'c', 'a'), true);
  assert.equal(wouldCreateCycle(edges, 'a', 'c'), false);
  assert.equal(wouldCreateCycle(edges, 'd', 'a'), false);
});

test('layerGraph produces topological layers and flags cycles', () => {
  const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'c'), edge('e3', 'a', 'c')];
  const { layers, cyclic } = layerGraph(edges, ['a', 'b', 'c']);
  assert.equal(cyclic, false);
  assert.deepEqual(layers[0], ['a']);
  assert.deepEqual(layers[1], ['b']);
  assert.deepEqual(layers[2], ['c']);

  const cyclicResult = layerGraph([edge('e1', 'a', 'b'), edge('e2', 'b', 'a')], ['a', 'b']);
  assert.equal(cyclicResult.cyclic, true);
});
