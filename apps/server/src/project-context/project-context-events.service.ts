import { Injectable } from '@nestjs/common';
import { Subject, Observable, filter } from 'rxjs';

/**
 * Delta emitted after each successful context mutation. The REST/SSE layer
 * (and future socket.io wiring) subscribes to this stream so the UI and
 * dependent stages react to context changes without polling.
 */
export interface ContextDelta {
  projectId: string;
  commitId: string;
  domain: string;
  externalId: string | null;
  itemId: string;
  itemVersion: number;
  operation: string;
  actorType: 'agent' | 'user' | 'system';
  actorKey: string | null;
  at: string;
}

@Injectable()
export class ProjectContextEventsService {
  private readonly deltas = new Subject<ContextDelta>();

  publish(delta: ContextDelta): void {
    this.deltas.next(delta);
  }

  stream(): Observable<ContextDelta> {
    return this.deltas.asObservable();
  }

  onProject(projectId: string): Observable<ContextDelta> {
    return this.deltas.asObservable().pipe(filter((d) => d.projectId === projectId));
  }
}
