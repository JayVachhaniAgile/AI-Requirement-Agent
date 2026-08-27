import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { OrchestrationPlanEntity } from './orchestration-plan.entity';
import { OrchestrationNodeEntity } from './orchestration-node.entity';
import { OrchestrationExecutor, type ApprovalResolver, type EventSink, type ExecutorRunResult } from './orchestration.executor';
import { planOrchestration, planAffectedOnly } from './orchestration.plan';
import { SKILL_DEFINITIONS } from '../skills/skill.definitions';
import { SkillExecutorService } from '../skills/skill-executor.service';
import { QualityGateService } from '../validation/quality-gate.service';
import { ImpactAnalysisService } from '../artifacts/impact-analysis.service';
import { ArtifactRegistryService } from '../artifacts/artifact-registry.service';
import type {
  CheckpointState,
  OrchestrationPlan,
  OrchestrationRequest,
  OrchestrationState,
  PlanProjectState,
} from './orchestration.types';

/**
 * OrchestrationService (Phase 7) — Nest wrapper around the dynamic planner +
 * executor. Persists plans and node state; wires the real skill runner,
 * quality gates and impact-based incremental planning.
 */
@Injectable()
export class OrchestrationService {
  constructor(
    @InjectRepository(OrchestrationPlanEntity)
    private readonly planRepo: Repository<OrchestrationPlanEntity>,
    @InjectRepository(OrchestrationNodeEntity)
    private readonly nodeRepo: Repository<OrchestrationNodeEntity>,
    private readonly skills: SkillExecutorService,
    private readonly qualityGates: QualityGateService,
    private readonly impact: ImpactAnalysisService,
    private readonly artifacts: ArtifactRegistryService,
  ) {}

  /** Build a plan from project state (persisted). */
  async createPlan(request: OrchestrationRequest): Promise<OrchestrationPlanEntity> {
    const projectState = await this.buildProjectState(request);
    let plan: OrchestrationPlan;
    if (request.onlyAffectedBy) {
      const report = await this.impact.analyze(request.projectId, request.onlyAffectedBy, { maxDepth: 8 });
      const affectedTypes = new Set<string>();
      for (const level of [report.levels.DIRECT, report.levels.INDIRECT, report.levels.POTENTIAL]) {
        for (const a of level) affectedTypes.add(a.artifactType);
      }
      plan = planAffectedOnly(request, projectState, SKILL_DEFINITIONS, [...affectedTypes]);
    } else {
      plan = planOrchestration({ request, projectState, skillDefinitions: SKILL_DEFINITIONS });
    }

    const row = this.planRepo.create({
      id: randomUUID(),
      projectId: request.projectId,
      requestedOutcome: request.requestedOutcome,
      plan: plan as unknown as Record<string, unknown>,
      status: 'PLANNED',
      currentLevel: 0,
      error: null,
    });
    const saved = await this.planRepo.save(row);

    // Persist node state rows.
    const nodes = Object.values(plan.nodes).map((node) =>
      this.nodeRepo.create({
        id: randomUUID(),
        planId: saved.id,
        projectId: request.projectId,
        nodeId: node.id,
        skillKey: node.skillKey,
        status: 'PLANNED',
        level: node.level,
        required: node.required,
        checkpoint: node.checkpoint ?? false,
        approvalType: node.approvalType ?? null,
        approvalStatus: node.checkpoint ? 'PENDING' : null,
        retryCount: 0,
        maxRetries: node.maxRetries ?? request.maxRetries ?? 2,
        reused: node.reuse,
      }),
    );
    await this.nodeRepo.save(nodes);
    return saved;
  }

  /** Execute a plan (real skill execution + quality gates). */
  async runPlan(planId: string): Promise<ExecutorRunResult> {
    const row = await this.planRepo.findOne({ where: { id: planId } });
    if (!row) throw new NotFoundException(`Plan '${planId}' not found`);
    const plan = row.plan as unknown as OrchestrationPlan;

    await this.planRepo.update(planId, { status: 'RUNNING', error: null });
    const executor = new OrchestrationExecutor({ maxRetries: 2 });
    executor.withDeps({
      approvals: this.approvals(planId),
      events: this.events(planId),
    });

    const ctx = this.executionContext(planId, plan);
    const result = await executor.execute(plan, ctx, {
      run: (node) => this.runSkillNode(plan, node.skillKey),
    });

    await this.planRepo.update(planId, { status: result.status, currentLevel: result.status === 'FAILED' ? row.currentLevel + 1 : row.currentLevel });
    return result;
  }

  /** Retry a single failed/blocked node (partial execution). */
  async retryNode(planId: string, nodeId: string): Promise<ExecutorRunResult> {
    const row = await this.planRepo.findOne({ where: { id: planId } });
    if (!row) throw new NotFoundException(`Plan '${planId}' not found`);
    const plan = row.plan as unknown as OrchestrationPlan;
    const node = plan.nodes[nodeId];
    if (!node) throw new NotFoundException(`Node '${nodeId}' not in plan`);
    await this.nodeRepo.update({ planId, nodeId }, { status: 'PLANNED', error: null });
    const executor = new OrchestrationExecutor({ maxRetries: 2 });
    executor.withDeps({ events: this.events(planId) });
    return executor.execute(plan, this.executionContext(planId, plan), {
      run: (n) => this.runSkillNode(plan, n.skillKey),
    }, { onlyNodeId: nodeId });
  }

  async pausePlan(planId: string): Promise<void> {
    await this.planRepo.update(planId, { status: 'WAITING' });
  }

  /** Resume from the first incomplete level (resume after failure/pause). */
  async resumePlan(planId: string): Promise<ExecutorRunResult> {
    const row = await this.planRepo.findOne({ where: { id: planId } });
    if (!row) throw new NotFoundException(`Plan '${planId}' not found`);
    const plan = row.plan as unknown as OrchestrationPlan;
    const nodes = await this.nodeRepo.find({ where: { planId } });
    const completedLevels = new Set(nodes.filter((n) => n.status === 'COMPLETED').map((n) => n.level));
    let fromLevel = 0;
    while (completedLevels.has(fromLevel)) fromLevel += 1;
    await this.planRepo.update(planId, { status: 'RUNNING' });
    const executor = new OrchestrationExecutor({ maxRetries: 2 });
    executor.withDeps({ approvals: this.approvals(planId), events: this.events(planId) });
    return executor.execute(plan, this.executionContext(planId, plan), {
      run: (n) => this.runSkillNode(plan, n.skillKey),
    }, { fromLevel });
  }

  /** Approve/reject a human checkpoint node. */
  async decideCheckpoint(planId: string, nodeId: string, decision: 'APPROVED' | 'REJECTED', _approvedBy?: string): Promise<void> {
    await this.nodeRepo.update({ planId, nodeId }, { approvalStatus: decision });
    if (decision === 'APPROVED') {
      await this.nodeRepo.update({ planId, nodeId }, { status: 'COMPLETED' });
    }
  }

  async getPlan(planId: string): Promise<{ plan: OrchestrationPlanEntity; nodes: OrchestrationNodeEntity[] }> {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException(`Plan '${planId}' not found`);
    const nodes = await this.nodeRepo.find({ where: { planId }, order: { level: 'ASC', nodeId: 'ASC' } });
    return { plan, nodes };
  }

  async listPlans(projectId: string): Promise<OrchestrationPlanEntity[]> {
    return this.planRepo.find({ where: { projectId }, order: { createdAt: 'DESC' } });
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async buildProjectState(request: OrchestrationRequest): Promise<PlanProjectState> {
    const artifacts = await this.artifacts.listByProject(request.projectId);
    return {
      artifactTypesPresent: artifacts.filter((a) => a.status === 'APPROVED' || a.status === 'CONFIRMED').map((a) => a.type),
      signals: request.signals ?? {},
      onlyAffectedBy: request.onlyAffectedBy,
    };
  }

  private executionContext(planId: string, plan: OrchestrationPlan) {
    const nodeById = new Map(Object.values(plan.nodes).map((n) => [n.id, n]));
    const checkpointCache = new Map<string, CheckpointState>();
    // In-memory mirror of node state so the executor stays synchronous; DB
    // writes are fire-and-forget (persisted for resume/recovery).
    const stateCache = new Map<string, OrchestrationState>();
    void this.nodeRepo.find({ where: { planId } }).then((rows) => {
      for (const row of rows) stateCache.set(row.nodeId, row.status as OrchestrationState);
    });
    return {
      getState: (nodeId: string) => stateCache.get(nodeId) ?? 'PLANNED',
      setState: (nodeId: string, state: string, extra?: { error?: string; retryCount?: number }) => {
        stateCache.set(nodeId, state as OrchestrationState);
        const patch: Partial<OrchestrationNodeEntity> = { status: state };
        if (extra?.error !== undefined) patch.error = extra.error;
        if (extra?.retryCount !== undefined) patch.retryCount = extra.retryCount;
        void this.nodeRepo.update({ planId, nodeId }, patch).catch(() => undefined);
      },
      getCheckpoint: (nodeId: string) => {
        const spec = nodeById.get(nodeId);
        if (!spec?.checkpoint) return undefined;
        const cached = checkpointCache.get(nodeId);
        if (cached) return cached;
        const checkpoint: CheckpointState = {
          planId,
          nodeId,
          approvalType: spec.approvalType ?? 'REVIEW',
          status: 'PENDING',
        };
        checkpointCache.set(nodeId, checkpoint);
        return checkpoint;
      },
    };
  }

  private approvals(planId: string): ApprovalResolver {
    return {
      isApproved: async (checkpoint: CheckpointState) => {
        const row = await this.nodeRepo.findOne({ where: { planId, nodeId: checkpoint.nodeId } });
        return row?.approvalStatus === 'APPROVED';
      },
    };
  }

  private events(planId: string): EventSink {
    return async (event) => {
      if (event.type === 'checkpoint-waiting' && event.nodeId) {
        await this.nodeRepo.update({ planId, nodeId: event.nodeId }, { status: 'WAITING', approvalStatus: 'PENDING' });
      }
      if (event.type === 'node-completed' && event.nodeId) {
        await this.nodeRepo.update({ planId, nodeId: event.nodeId }, { status: 'COMPLETED', completedAt: new Date(), error: null });
      }
    };
  }

  private async runSkillNode(plan: OrchestrationPlan, skillKey: string): Promise<{ status: 'COMPLETED' | 'FAILED'; error?: string; output?: Record<string, unknown>; nodeId?: string }> {
    try {
      await this.skills.execute(skillKey, {
        projectId: plan.projectId,
        task: plan.requestedOutcome,
      });
      // Quality gates after skill execution (post-persistence).
      await this.qualityGates.run({
        projectId: plan.projectId,
        requiredArtifactTypes: [],
      });
      return { status: 'COMPLETED' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: 'FAILED', error: message };
    }
  }
}
