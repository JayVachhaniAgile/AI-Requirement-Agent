import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subscription } from 'rxjs';
import { ProjectsGateway } from '../realtime/projects.gateway';
import { DagEventsService } from './dag-events.service';

/**
 * Forwards DAG execution deltas to the project WebSocket room:
 * - `dag.node.updated` — node status changes
 * - `dag.run.updated` — run status changes
 */
@Injectable()
export class DagRealtimeBridge implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DagRealtimeBridge.name);
  private subscription: Subscription | null = null;

  constructor(
    private readonly events: DagEventsService,
    private readonly gateway: ProjectsGateway,
  ) {}

  onModuleInit(): void {
    this.subscription = this.events.stream().subscribe((delta) => {
      try {
        if (delta.kind === 'node') {
          this.gateway.emitToProject(delta.projectId, 'dag.node.updated', {
            projectId: delta.projectId,
            runId: delta.runId,
            nodeKey: delta.nodeKey,
            status: delta.status,
            retryCount: delta.retryCount,
            error: delta.error,
            at: delta.at,
          });
        } else {
          this.gateway.emitToProject(delta.projectId, 'dag.run.updated', {
            projectId: delta.projectId,
            runId: delta.runId,
            status: delta.status,
            currentLevel: delta.currentLevel,
            currentNodeKey: delta.currentNodeKey,
            at: delta.at,
          });
        }
      } catch (err) {
        this.logger.warn(`Failed to forward DAG delta: ${String(err)}`);
      }
    });
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }
}
