import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';

/** Delta emitted when a DAG node or run changes state. */
export interface DagNodeDelta {
  kind: 'node';
  projectId: string;
  runId: string;
  nodeKey: string;
  status: string;
  retryCount: number;
  error: string | null;
  at: string;
}

export interface DagRunDelta {
  kind: 'run';
  projectId: string;
  runId: string;
  status: string;
  currentLevel: number;
  currentNodeKey: string | null;
  at: string;
}

export type DagDelta = DagNodeDelta | DagRunDelta;

/**
 * In-process event bus for DAG execution progress. The realtime bridge
 * subscribes and forwards deltas to the project WebSocket room
 * (`dag.node.updated` / `dag.run.updated`).
 */
@Injectable()
export class DagEventsService {
  private readonly deltas = new Subject<DagDelta>();

  publish(delta: DagDelta): void {
    this.deltas.next(delta);
  }

  stream(): Observable<DagDelta> {
    return this.deltas.asObservable();
  }
}
