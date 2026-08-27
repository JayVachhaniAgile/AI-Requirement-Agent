/**
 * OrchestrationExecutor (Phase 7) — level-based execution engine.
 *
 * Walks the plan's topological levels; nodes inside a level run concurrently
 * (bounded). Handles:
 *   - execution states (PLANNED→QUEUED→RUNNING→COMPLETED/FAILED/BLOCKED)
 *   - skill retry with exponential backoff + failure classification
 *   - human checkpoints (node pauses → WAITING for approval)
 *   - dependency blocking (failed required node blocks dependents)
 *   - partial execution (run/retry individual nodes or failed branches)
 *   - resume (continue from the first incomplete level)
 *
 * The engine is runner-agnostic: the Nest service injects the real skill
 * runner + quality-gate runner.
 */
import type {
  CheckpointState,
  ExecutorOptions,
  NodeRunResult,
  OrchestrationNodeSpec,
  OrchestrationPlan,
  OrchestrationState,
} from './orchestration.types';

export interface NodeRunner {
  /** Run a single node; `nodeId` is attached by the executor. */
  run(node: OrchestrationNodeSpec): Promise<Omit<NodeRunResult, 'nodeId'>>;
}

export interface ApprovalResolver {
  /** Returns true when the checkpoint has been approved. */
  isApproved(checkpoint: CheckpointState): Promise<boolean>;
}

export interface ExecutorEvent {
  type:
    | 'level-start'
    | 'node-queued'
    | 'node-running'
    | 'node-completed'
    | 'node-failed'
    | 'node-blocked'
    | 'node-retrying'
    | 'checkpoint-waiting'
    | 'level-complete'
    | 'workflow-completed'
    | 'workflow-failed'
    | 'workflow-paused';
  planId: string;
  nodeId?: string;
  level?: number;
  error?: string;
  retryCount?: number;
  at: string;
}

export type EventSink = (event: ExecutorEvent) => void | Promise<void>;

export interface ExecutorRunResult {
  status: 'COMPLETED' | 'FAILED' | 'PAUSED' | 'CANCELLED';
  completed: string[];
  failed: string[];
  blocked: string[];
  waiting: string[];
}

export interface ExecutionContext {
  /** Current per-node state (persisted by the caller). */
  getState: (nodeId: string) => OrchestrationState;
  setState: (nodeId: string, state: OrchestrationState, extra?: { error?: string; retryCount?: number }) => Promise<void> | void;
  /** Pending human checkpoints (nodeId → checkpoint). */
  getCheckpoint: (nodeId: string) => CheckpointState | undefined;
}

const TRANSIENT_ERRORS = ['rate limit', 'timeout', '429', '500', 'ETIMEDOUT', 'ECONNRESET', 'overloaded', 'unavailable'];

export function classifyFailure(error: string): 'transient' | 'permanent' {
  const lower = error.toLowerCase();
  return TRANSIENT_ERRORS.some((t) => lower.includes(t)) ? 'transient' : 'permanent';
}

export function backoffMs(attempt: number, baseMs: number): number {
  return baseMs * 2 ** attempt;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OrchestrationExecutor {
  private readonly concurrency: number;
  private readonly retryBaseDelayMs: number;
  private readonly maxRetries: number;
  private approvals: ApprovalResolver;
  private events: EventSink;

  constructor(options: ExecutorOptions = {}) {
    this.concurrency = options.concurrency ?? 4;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 1000;
    this.maxRetries = options.maxRetries ?? 2;
    this.approvals = { isApproved: async () => true };
    this.events = async () => undefined;
  }

  /** Wire external dependencies (Nest service provides these). */
  withDeps(deps: { approvals?: ApprovalResolver; events?: EventSink }): this {
    if (deps.approvals) this.approvals = deps.approvals;
    if (deps.events) this.events = deps.events;
    return this;
  }

  async execute(
    plan: OrchestrationPlan,
    ctx: ExecutionContext,
    runner: NodeRunner,
    options: { pauseRequested?: () => boolean; onlyNodeId?: string; fromLevel?: number } = {},
  ): Promise<ExecutorRunResult> {
    const result: ExecutorRunResult = { status: 'COMPLETED', completed: [], failed: [], blocked: [], waiting: [] };

    // Single-node retry (partial execution).
    if (options.onlyNodeId) {
      const node = plan.nodes[options.onlyNodeId];
      if (node) {
        const outcome = await this.runNode(plan, node, ctx, runner);
        this.collect(node.id, outcome, result);
      }
      return result;
    }

    const startLevel = options.fromLevel ?? 0;
    for (let level = startLevel; level < plan.levels.length; level++) {
      if (options.pauseRequested?.()) {
        result.status = 'PAUSED';
        await this.events({ type: 'workflow-paused', planId: plan.projectId, level, at: new Date().toISOString() });
        break;
      }
      const levelIds = plan.levels[level];
      await this.events({ type: 'level-start', planId: plan.projectId, level, at: new Date().toISOString() });

      // Skip nodes whose dependencies failed → BLOCKED (unless previously completed).
      const runnable: OrchestrationNodeSpec[] = [];
      for (const id of levelIds) {
        const node = plan.nodes[id];
        if (!node) continue;
        if (ctx.getState(node.id) === 'COMPLETED') {
          result.completed.push(node.id);
          continue;
        }
        if (node.reuse) {
          ctx.setState(node.id, 'COMPLETED', {});
          await this.events({ type: 'node-completed', planId: plan.projectId, nodeId: node.id, level, at: new Date().toISOString() });
          result.completed.push(node.id);
          continue;
        }
        if (this.dependenciesFailed(node, ctx)) {
          ctx.setState(node.id, 'BLOCKED', { error: 'dependency failed' });
          await this.events({ type: 'node-blocked', planId: plan.projectId, nodeId: node.id, level, error: 'dependency failed', at: new Date().toISOString() });
          result.blocked.push(node.id);
          continue;
        }
        runnable.push(node);
      }

      // Human checkpoints at this level: wait before running dependents.
      const waiting = levelIds.filter((id) => plan.checkpoints[id] && !this.isCheckpointApproved(plan, ctx, id));
      for (const id of waiting) {
        ctx.setState(id, 'WAITING', {});
        await this.events({ type: 'checkpoint-waiting', planId: plan.projectId, nodeId: id, level, at: new Date().toISOString() });
        result.waiting.push(id);
      }
      if (waiting.length > 0) {
        result.status = 'PAUSED';
        break;
      }

      await this.runLevel(plan, runnable, ctx, runner, result);
      await this.events({ type: 'level-complete', planId: plan.projectId, level, at: new Date().toISOString() });
    }

    if (result.status === 'COMPLETED' && (result.failed.length > 0 || result.blocked.length > 0)) {
      result.status = 'FAILED';
    }
    if (result.status === 'COMPLETED') {
      await this.events({ type: 'workflow-completed', planId: plan.projectId, at: new Date().toISOString() });
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async runLevel(
    plan: OrchestrationPlan,
    nodes: OrchestrationNodeSpec[],
    ctx: ExecutionContext,
    runner: NodeRunner,
    result: ExecutorRunResult,
  ): Promise<void> {
    // Bounded concurrency.
    const queue = [...nodes];
    const workers = Array.from({ length: Math.min(this.concurrency, queue.length) }, async () => {
      while (queue.length > 0) {
        const node = queue.shift();
        if (!node) break;
        const outcome = await this.runNode(plan, node, ctx, runner);
        this.collect(node.id, outcome, result);
      }
    });
    await Promise.all(workers);
  }

  private async runNode(
    plan: OrchestrationPlan,
    node: OrchestrationNodeSpec,
    ctx: ExecutionContext,
    runner: NodeRunner,
  ): Promise<NodeRunResult> {
    ctx.setState(node.id, 'QUEUED', {});
    await this.events({ type: 'node-queued', planId: plan.projectId, nodeId: node.id, level: node.level, at: new Date().toISOString() });

    const maxAttempts = Math.min(this.maxRetries, node.maxRetries ?? this.maxRetries);
    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      ctx.setState(attempt === 0 ? node.id : node.id, attempt === 0 ? 'RUNNING' : 'RETRYING', { retryCount: attempt });
      await this.events({ type: attempt === 0 ? 'node-running' : 'node-retrying', planId: plan.projectId, nodeId: node.id, level: node.level, retryCount: attempt, at: new Date().toISOString() });
      try {
        const outcome = await runner.run(node);
        ctx.setState(node.id, 'COMPLETED', {});
        await this.events({ type: 'node-completed', planId: plan.projectId, nodeId: node.id, level: node.level, at: new Date().toISOString() });
        return { ...outcome, nodeId: node.id };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        const kind = classifyFailure(error);
        if (attempt < maxAttempts && kind === 'transient') {
          const delay = backoffMs(attempt, this.retryBaseDelayMs);
          await sleep(delay);
          continue;
        }
        ctx.setState(node.id, 'FAILED', { error });
        await this.events({ type: 'node-failed', planId: plan.projectId, nodeId: node.id, level: node.level, error, retryCount: attempt, at: new Date().toISOString() });
        return { nodeId: node.id, status: 'FAILED', error };
      }
    }
    ctx.setState(node.id, 'FAILED', { error: 'max retries exceeded' });
    return { nodeId: node.id, status: 'FAILED', error: 'max retries exceeded' };
  }

  private dependenciesFailed(node: OrchestrationNodeSpec, ctx: ExecutionContext): boolean {
    return node.dependsOn.some((dep) => {
      const state = ctx.getState(dep);
      return state === 'FAILED' || state === 'BLOCKED';
    });
  }

  private isCheckpointApproved(plan: OrchestrationPlan, ctx: ExecutionContext, nodeId: string): boolean {
    const checkpoint = ctx.getCheckpoint(nodeId);
    if (!checkpoint) return true;
    return checkpoint.status === 'APPROVED';
  }

  private collect(nodeId: string, outcome: NodeRunResult, result: ExecutorRunResult): void {
    if (outcome.status === 'COMPLETED') {
      result.completed.push(nodeId);
    } else {
      result.failed.push(nodeId);
    }
  }
}
