/**
 * Pure graph algorithms for the artifact dependency graph.
 *
 * No I/O and no NestJS imports — fully unit-testable. The graph is stored in
 * the relational `artifact_dependencies` table; these helpers compute
 * reachability, layers and cycle safety in application code.
 */

export interface ArtifactEdge {
  id: string;
  projectId: string;
  sourceArtifactId: string;
  targetArtifactId: string;
  relation: string;
  weight: number;
}

export interface Adjacency {
  /** Edge ids keyed by source artifact id. */
  outgoing: Map<string, string[]>;
  /** Edge ids keyed by target artifact id. */
  incoming: Map<string, string[]>;
}

export function buildAdjacency(edges: ArtifactEdge[]): Adjacency {
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const edge of edges) {
    const out = outgoing.get(edge.sourceArtifactId) ?? [];
    out.push(edge.id);
    outgoing.set(edge.sourceArtifactId, out);

    const inc = incoming.get(edge.targetArtifactId) ?? [];
    inc.push(edge.id);
    incoming.set(edge.targetArtifactId, inc);
  }
  return { outgoing, incoming };
}

export function edgeById(edges: ArtifactEdge[], id: string): ArtifactEdge | undefined {
  return edges.find((edge) => edge.id === id);
}

/**
 * Depth-bounded BFS over outgoing edges. Returns the set of reachable
 * artifact ids (excluding `startId` itself).
 */
export function reachableDownstream(
  edges: ArtifactEdge[],
  startId: string,
  maxDepth = Infinity,
): Set<string> {
  const adjacency = buildAdjacency(edges);
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (current.depth >= maxDepth) continue;
    const next = adjacency.outgoing.get(current.id) ?? [];
    for (const edgeId of next) {
      const edge = edgeById(edges, edgeId);
      if (!edge) continue;
      if (!visited.has(edge.targetArtifactId)) {
        visited.add(edge.targetArtifactId);
        queue.push({ id: edge.targetArtifactId, depth: current.depth + 1 });
      }
    }
  }
  return visited;
}

/** Depth-bounded BFS over incoming edges (who references / depends-on me). */
export function reachableUpstream(
  edges: ArtifactEdge[],
  startId: string,
  maxDepth = Infinity,
): Set<string> {
  const adjacency = buildAdjacency(edges);
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (current.depth >= maxDepth) continue;
    const next = adjacency.incoming.get(current.id) ?? [];
    for (const edgeId of next) {
      const edge = edgeById(edges, edgeId);
      if (!edge) continue;
      if (!visited.has(edge.sourceArtifactId)) {
        visited.add(edge.sourceArtifactId);
        queue.push({ id: edge.sourceArtifactId, depth: current.depth + 1 });
      }
    }
  }
  return visited;
}

/**
 * True when adding `source -> target` would create a cycle in the existing
 * graph (i.e. `target` can already reach `source`). A self-edge is always a
 * cycle.
 */
export function wouldCreateCycle(
  edges: ArtifactEdge[],
  sourceArtifactId: string,
  targetArtifactId: string,
): boolean {
  if (sourceArtifactId === targetArtifactId) return true;
  return reachableDownstream(edges, targetArtifactId).has(sourceArtifactId);
}

/**
 * Kahn layering over artifact ids. Returns a list of layers; ids inside a
 * layer are mutually independent. Detects cycles via in-degree bookkeeping —
 * if any node remains unplaced, the graph is cyclic.
 */
export function layerGraph(edges: ArtifactEdge[], allIds: string[]): {
  layers: string[][];
  cyclic: boolean;
} {
  const adjacency = buildAdjacency(edges);
  const indegree = new Map<string, number>();
  for (const id of allIds) {
    indegree.set(id, 0);
  }
  for (const edge of edges) {
    indegree.set(edge.targetArtifactId, (indegree.get(edge.targetArtifactId) ?? 0) + 1);
  }

  const remaining = new Set(allIds);
  const layers: string[][] = [];
  let placed = 0;

  while (remaining.size > 0) {
    const ready = [...remaining].filter((id) => (indegree.get(id) ?? 0) === 0);
    if (ready.length === 0) {
      return { layers, cyclic: true };
    }
    layers.push(ready);
    for (const id of ready) {
      remaining.delete(id);
      placed += 1;
      for (const edgeId of adjacency.outgoing.get(id) ?? []) {
        const edge = edgeById(edges, edgeId);
        if (edge) {
          indegree.set(
            edge.targetArtifactId,
            (indegree.get(edge.targetArtifactId) ?? 0) - 1,
          );
        }
      }
    }
  }

  return { layers, cyclic: placed < allIds.length };
}
