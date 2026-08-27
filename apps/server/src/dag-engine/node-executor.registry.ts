import { Injectable } from '@nestjs/common';
import type { NodeExecutor } from './types';

export class NodeNotWiredError extends Error {
  constructor(nodeKey: string) {
    super(`No executor registered for DAG node '${nodeKey}'. Register one via NodeExecutorRegistry.`);
    this.name = 'NodeNotWiredError';
  }
}

/**
 * Registry mapping DAG node keys to executor functions. Executors are the
 * integration point with the AI agents: an adapter that calls
 * DiscoveryService.run(ctx), ResearchService.run(ctx), etc. can be registered
 * here per node key. Kept separate from the executor so the engine core stays
 * generic and testable.
 */
@Injectable()
export class NodeExecutorRegistry {
  private readonly executors = new Map<string, NodeExecutor>();

  register(nodeKey: string, executor: NodeExecutor): void {
    this.executors.set(nodeKey, executor);
  }

  registerMany(executors: Record<string, NodeExecutor>): void {
    for (const [key, executor] of Object.entries(executors)) {
      this.register(key, executor);
    }
  }

  has(nodeKey: string): boolean {
    return this.executors.has(nodeKey);
  }

  get(nodeKey: string): NodeExecutor {
    const executor = this.executors.get(nodeKey);
    if (!executor) throw new NodeNotWiredError(nodeKey);
    return executor;
  }

  list(): string[] {
    return [...this.executors.keys()];
  }
}
