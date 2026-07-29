import { Injectable, Logger } from '@nestjs/common';
import { ProjectsGateway } from './projects.gateway';
import { getPhasesForAgent } from './agent-phases';

export type ActivityStatus = 'pending' | 'active' | 'done';

export interface AgentActivityPhase {
  phaseId: string;
  label: string;
  status: ActivityStatus;
}

@Injectable()
export class WorkflowEventsService {
  private readonly logger = new Logger(WorkflowEventsService.name);
  private readonly phaseTimers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(private readonly gateway: ProjectsGateway) {}

  emitProjectStatus(
    projectId: string,
    data: { status: string; currentStage: string | null; errorMessage?: string | null },
  ): void {
    this.gateway.emitToProject(projectId, 'project.status', { projectId, ...data });
  }

  emitStageUpdated(
    projectId: string,
    data: {
      stage: string;
      status: string;
      startedAt?: string | null;
      completedAt?: string | null;
      durationMs?: number | null;
      error?: string | null;
    },
  ): void {
    this.gateway.emitToProject(projectId, 'stage.updated', { projectId, ...data });
  }

  emitAgentActivity(
    projectId: string,
    agentKey: string,
    phases: AgentActivityPhase[],
  ): void {
    this.gateway.emitToProject(projectId, 'agent.activity', {
      projectId,
      agentKey,
      phases,
      activePhaseId: phases.find((p) => p.status === 'active')?.phaseId ?? null,
    });
  }

  emitKnowledgeCreated(
    projectId: string,
    items: Array<{ type: string; title: string; externalId?: string | null; source?: string | null }>,
  ): void {
    this.gateway.emitToProject(projectId, 'knowledge.created', { projectId, items });
  }

  emitExecutionUpdated(
    projectId: string,
    data: {
      executionId: string;
      agentKey: string;
      status: string;
      inputTokens?: number;
      outputTokens?: number;
      model?: string | null;
      error?: string | null;
    },
  ): void {
    this.gateway.emitToProject(projectId, 'execution.updated', { projectId, ...data });
  }

  emitDashboardSnapshot(projectId: string, snapshot: unknown): void {
    this.gateway.emitToProject(projectId, 'dashboard.snapshot', snapshot);
  }

  /** Start timed phase progression while an agent runs. */
  startActivityPhases(projectId: string, agentKey: string): void {
    this.stopActivityPhases(projectId, agentKey);
    const defs = getPhasesForAgent(agentKey);
    let index = 0;

    const emitAt = (activeIndex: number) => {
      const phases: AgentActivityPhase[] = defs.map((d, i) => ({
        phaseId: d.id,
        label: d.label,
        status: i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'pending',
      }));
      this.emitAgentActivity(projectId, agentKey, phases);
    };

    emitAt(0);
    const intervalMs = Math.max(4_000, Math.min(12_000, 45_000 / Math.max(defs.length, 1)));
    const timer = setInterval(() => {
      index = Math.min(index + 1, defs.length - 1);
      emitAt(index);
      if (index >= defs.length - 1) {
        this.stopActivityPhases(projectId, agentKey);
      }
    }, intervalMs);

    this.phaseTimers.set(this.timerKey(projectId, agentKey), timer);
  }

  /** Mark all phases done and clear timer. */
  completeActivityPhases(projectId: string, agentKey: string): void {
    this.stopActivityPhases(projectId, agentKey);
    const defs = getPhasesForAgent(agentKey);
    this.emitAgentActivity(
      projectId,
      agentKey,
      defs.map((d) => ({ phaseId: d.id, label: d.label, status: 'done' as const })),
    );
  }

  stopActivityPhases(projectId: string, agentKey: string): void {
    const key = this.timerKey(projectId, agentKey);
    const timer = this.phaseTimers.get(key);
    if (timer) {
      clearInterval(timer);
      this.phaseTimers.delete(key);
    }
  }

  private timerKey(projectId: string, agentKey: string): string {
    return `${projectId}:${agentKey}`;
  }
}
