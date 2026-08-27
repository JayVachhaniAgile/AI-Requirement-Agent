/**
 * Pure DAG algorithms: topological layering (longest-path), cycle detection,
 * and execution-plan generation. No I/O, no Nest dependencies — unit-testable.
 */
import type {
  ExecutionPlan,
  DagNodeDef,
  NodeMeta,
  WorkflowDagDefinition,
} from './types';

export interface GraphAnalysis {
  /** Topological layers; nodes within a layer are independent and parallelizable. */
  layers: string[][];
  /** Stable topological order (Kahn). */
  order: string[];
  /** Detected cycles (each entry is the set of nodes still scheduled). */
  cycles: string[][];
  /** Direct dependencies per node. */
  nodeDeps: Record<string, string[]>;
}

/**
 * Analyze a DAG: validate edges, compute dependency map, produce topological
 * layers via Kahn's algorithm. A cycle is reported when nodes remain after
 * level extraction.
 */
export function analyzeDag(def: WorkflowDagDefinition): GraphAnalysis {
  const nodes = def.nodes.map((n) => n.key);
  const nodeSet = new Set(nodes);
  const nodeDeps: Record<string, string[]> = {};
  const dependents: Record<string, string[]> = {};
  for (const key of nodes) {
    nodeDeps[key] = [];
    dependents[key] = [];
  }
  for (const edge of def.edges) {
    if (!nodeSet.has(edge.from) || !nodeSet.has(edge.to)) {
      throw new Error(
        `DAG edge references unknown node: ${edge.from} -> ${edge.to} (definition ${def.key})`,
      );
    }
    nodeDeps[edge.to].push(edge.from);
    dependents[edge.from].push(edge.to);
  }

  const indegree: Record<string, number> = {};
  for (const key of nodes) indegree[key] = nodeDeps[key].length;

  const layers: string[][] = [];
  const order: string[] = [];
  const scheduled = new Set<string>();

  while (true) {
    const ready = nodes.filter((n) => !scheduled.has(n) && indegree[n] === 0);
    if (ready.length === 0) break;
    layers.push(ready);
    for (const n of ready) {
      scheduled.add(n);
      order.push(n);
    }
    for (const n of ready) {
      for (const dependent of dependents[n]) indegree[dependent] -= 1;
    }
  }

  const remaining = nodes.filter((n) => !scheduled.has(n));
  const cycles = remaining.length > 0 ? [remaining] : [];
  return { layers, order, cycles, nodeDeps };
}

/**
 * Generate the execution plan for a definition. Throws when the DAG contains
 * a cycle (execution cannot be scheduled).
 */
export function generatePlan(def: WorkflowDagDefinition): ExecutionPlan {
  const { layers, cycles, nodeDeps } = analyzeDag(def);
  if (cycles.length > 0) {
    throw new Error(`DAG ${def.key} contains a cycle involving: ${cycles[0].join(', ')}`);
  }
  const nodeMeta: Record<string, NodeMeta> = {};
  for (const node of def.nodes) {
    nodeMeta[node.key] = toNodeMeta(node, nodeDeps[node.key] ?? []);
  }
  return { definitionKey: def.key, layers, nodeMeta };
}

/** Resolve all transitive dependencies of a node (for re-run cascades). */
export function descendantsOf(
  def: WorkflowDagDefinition,
  start: string,
): string[] {
  const dependents: Record<string, string[]> = {};
  for (const node of def.nodes) dependents[node.key] = [];
  for (const edge of def.edges) dependents[edge.from].push(edge.to);
  const result: string[] = [];
  const seen = new Set<string>();
  const visit = (key: string) => {
    for (const d of dependents[key] ?? []) {
      if (!seen.has(d)) {
        seen.add(d);
        result.push(d);
        visit(d);
      }
    }
  };
  visit(start);
  return result;
}

/** Level index of a node inside the plan. */
export function levelOf(plan: ExecutionPlan, nodeKey: string): number {
  const index = plan.layers.findIndex((layer) => layer.includes(nodeKey));
  if (index === -1) throw new Error(`Node ${nodeKey} not found in plan ${plan.definitionKey}`);
  return index;
}

export function toNodeMeta(
  node: DagNodeDef,
  dependsOn: string[],
): NodeMeta {
  return {
    key: node.key,
    label: node.label ?? node.key,
    agentKey: node.agentKey ?? node.key,
    optional: node.optional ?? false,
    checkpoint: node.checkpoint ?? false,
    retries: node.retries ?? 2,
    timeoutMs: node.timeoutMs,
    dependsOn,
  };
}
