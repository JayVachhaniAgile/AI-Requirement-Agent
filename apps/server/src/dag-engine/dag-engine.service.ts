import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  Project,
  WorkflowDagDefinition,
  WorkflowDagNodeRun,
  WorkflowDagRun,
  WorkflowStep,
} from '../database/entities';
import {
  CRYSTALLIZE_PIPELINE_DAG,
  DAG_DEFINITIONS,
  getDagDefinition,
} from './pipeline.dag';
import { analyzeDag, descendantsOf, generatePlan, levelOf } from './graph';
import { DAG_NODE_TO_STAGE, stageToProjectStatus } from './stage-mapping';
import { NodeExecutorRegistry } from './node-executor.registry';
import { DagEventsService } from './dag-events.service';
import { RkbService } from '../rkb/rkb.service';
import type {
  DagNodeStatus,
  DagRunStatus,
  ExecutionPlan,
  NodeExecutionContext,
  NodeExecutionResult,
  WorkflowDagDefinition as DagDef,
} from './types';

/** Checkpoint / pause-for-approval nodes map to human-wait project statuses. */
const CHECKPOINT_PROJECT_STATUS: Record<string, string> = {
  discovery: 'WAITING_FOR_USER',
  'gap-analysis': 'GAP_ANALYSIS_REVIEW',
};

/** Document-producing nodes → documentType cleared on regenerate cascade. */
const NODE_DOCUMENT_TYPES: Record<string, string> = {
  'build-prompt': 'BUILD_PROMPT_DOCUMENT',
  compilation: 'COMPILED_DOCUMENT',
  frd: 'FRD_DOCUMENT',
  'user-stories': 'USER_STORIES_DOCUMENT',
  'tech-arch': 'TECH_ARCH_DOCUMENT',
  'db-design': 'DB_DESIGN_DOCUMENT',
  'api-spec': 'API_SPEC_DOCUMENT',
  sow: 'SOW_DOCUMENT',
};

interface LayerOutcome {
  pausedAt: string | null;
  failed: Array<{ nodeKey: string; error?: string }>;
}

@Injectable()
export class DagEngineService {
  private readonly logger = new Logger(DagEngineService.name);

  private readonly activeStarts = new Set<string>();
  private readonly activeAborts = new Map<string, AbortController>();

  constructor(
    @InjectRepository(WorkflowDagDefinition)
    private readonly defRepo: Repository<WorkflowDagDefinition>,
    @InjectRepository(WorkflowDagRun)
    private readonly runRepo: Repository<WorkflowDagRun>,
    @InjectRepository(WorkflowDagNodeRun)
    private readonly nodeRepo: Repository<WorkflowDagNodeRun>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(WorkflowStep)
    private readonly stepRepo: Repository<WorkflowStep>,
    private readonly registry: NodeExecutorRegistry,
    private readonly events: DagEventsService,
    private readonly rkb: RkbService,
    // Plain-number tuning knob: @Optional() keeps Nest DI from trying to
    // inject `Number` as a provider; the default applies in production and
    // tests may pass an explicit value.
    @Optional() private readonly concurrency = 5,
  ) {}

  // -------------------------------------------------------------------------
  // Definitions & plans
  // -------------------------------------------------------------------------

  listDefinitions() {
    return Object.values(DAG_DEFINITIONS).map((d) => ({
      key: d.key,
      name: d.name,
      description: d.description ?? '',
      nodeCount: d.nodes.length,
      edgeCount: d.edges.length,
    }));
  }

  getDefinition(key: string): DagDef {
    return getDagDefinition(key);
  }

  getPlan(key: string): ExecutionPlan {
    return generatePlan(getDagDefinition(key));
  }

  inspect(key: string) {
    return analyzeDag(getDagDefinition(key));
  }

  // -------------------------------------------------------------------------
  // Run lifecycle
  // -------------------------------------------------------------------------

  async startRun(projectId: string, definitionKey = CRYSTALLIZE_PIPELINE_DAG.key) {
    const def = getDagDefinition(definitionKey);
    const plan = generatePlan(def); // throws on cycles

    await this.persistDefinition(def);

    const run = await this.runRepo.save(
      this.runRepo.create({
        id: randomUUID(),
        projectId,
        definitionKey,
        status: 'PENDING',
        currentLevel: 0,
      }),
    );
    for (const node of def.nodes) {
      const meta = plan.nodeMeta[node.key];
      await this.nodeRepo.save(
        this.nodeRepo.create({
          id: randomUUID(),
          runId: run.id,
          nodeKey: node.key,
          status: 'PENDING',
          dependsOn: meta.dependsOn,
          required: !meta.optional,
          checkpoint: meta.checkpoint,
          maxRetries: meta.retries,
          timeoutMs: meta.timeoutMs ?? null,
        }),
      );
    }
    await this.executeRun(run.id);
    return this.runView(run.id);
  }

  async pause(runId: string) {
    const run = await this.requireRun(runId);
    if (run.status !== 'RUNNING' && run.status !== 'PENDING') {
      throw new BadRequestException(`Cannot pause a run in state ${run.status}`);
    }
    run.status = 'PAUSED';
    await this.saveRun(run);
    await this.projectRepo.update(run.projectId, { status: 'PAUSED' });
    return this.runView(runId);
  }

  async resume(runId: string) {
    const run = await this.requireRun(runId);
    if (run.status === 'COMPLETED' || run.status === 'CANCELLED') {
      throw new BadRequestException(`Cannot resume a run in state ${run.status}`);
    }
    if (run.status === 'WAITING_APPROVAL') {
      throw new BadRequestException('Checkpoint awaiting approval — use the approve endpoint');
    }
    const def = getDagDefinition(run.definitionKey);
    const plan = generatePlan(def);
    const resumeLevel =
      run.status === 'FAILED' && run.currentNodeKey
        ? levelOf(plan, run.currentNodeKey)
        : run.currentLevel;
    await this.resetFromLevel(run.id, plan, resumeLevel);
    await this.executeRun(run.id);
    return this.runView(runId);
  }

  async retryNode(runId: string, nodeKey: string) {
    const run = await this.requireRun(runId);
    const def = getDagDefinition(run.definitionKey);
    const plan = generatePlan(def);
    if (!plan.nodeMeta[nodeKey]) throw new NotFoundException(`Node ${nodeKey} not in DAG`);
    const level = levelOf(plan, nodeKey);
    await this.resetFromLevel(run.id, plan, level);
    await this.executeRun(run.id);
    return this.runView(runId);
  }

  async skipNode(runId: string, nodeKey: string) {
    const run = await this.requireRun(runId);
    const node = await this.nodeRepo.findOne({ where: { runId, nodeKey } });
    if (!node) throw new NotFoundException(`Node ${nodeKey} not in run`);
    if (!node.required) {
      node.status = 'SKIPPED';
      await this.saveNode(node, run.projectId, runId);
    } else {
      throw new BadRequestException(`Node ${nodeKey} is required and cannot be skipped`);
    }
    const fresh = await this.requireRun(runId);
    if (fresh.status !== 'RUNNING') {
      const def = getDagDefinition(run.definitionKey);
      const plan = generatePlan(def);
      await this.resetFromLevel(run.id, plan, levelOf(plan, nodeKey));
      await this.executeRun(run.id);
    }
    return this.runView(runId);
  }

  async approveCheckpoint(runId: string, nodeKey: string) {
    const run = await this.requireRun(runId);
    const node = await this.nodeRepo.findOne({ where: { runId, nodeKey } });
    if (!node) throw new NotFoundException(`Node ${nodeKey} not in run`);
    if (node.status !== 'WAITING_APPROVAL') {
      throw new BadRequestException(`Node ${nodeKey} is not awaiting approval (${node.status})`);
    }
    node.status = 'COMPLETED';
    node.outputJson = JSON.stringify({ approved: true, approvedAt: new Date().toISOString() });
    node.completedAt = new Date();
    await this.saveNode(node, run.projectId, runId);

    const plan = generatePlan(getDagDefinition(run.definitionKey));
    run.status = 'RUNNING';
    run.currentNodeKey = null;
    await this.saveRun(run);
    await this.executeFromLevel(run.id, plan, levelOf(plan, nodeKey) + 1);
    return this.runView(runId);
  }


  // -------------------------------------------------------------------------
  // Project-level convenience methods (replaces WorkflowService project API)
  // -------------------------------------------------------------------------

  /** Find the latest run for a project, optionally filtered by status. */
  private async latestRun(projectId: string, statuses?: string[]): Promise<WorkflowDagRun | null> {
    const where: Record<string, unknown> = { projectId };
    const query = this.runRepo.createQueryBuilder('r').where(where);
    if (statuses) {
      query.andWhere('r.status IN (:...statuses)', { statuses });
    }
    query.orderBy('r.createdAt', 'DESC');
    return query.getOne();
  }

  /** Cancel all active (not-yet-terminal) runs for a project before starting fresh. */
  private async cancelActiveRuns(projectId: string): Promise<void> {
    const abortCtrl = this.activeAborts.get(projectId);
    if (abortCtrl) {
      abortCtrl.abort();
      this.activeAborts.delete(projectId);
    }

    const active = await this.runRepo.find({
      where: [
        { projectId, status: 'PENDING' },
        { projectId, status: 'RUNNING' },
        { projectId, status: 'PAUSED' },
        { projectId, status: 'WAITING_APPROVAL' },
        { projectId, status: 'FAILED' },
      ],
    });
    for (const run of active) {
      run.status = 'CANCELLED';
      await this.saveRun(run);
    }
  }

  /**
   * Start (or restart) a pipeline run for a project. Handles both fresh
   * projects (status CREATED) and full reruns (status COMPLETED / FAILED /
   * GAP_ANALYSIS_REVIEW). Cancels prior runs and wipes pipeline artifacts
   * so knowledge/docs are not duplicated.
   */
  async startProject(projectId: string, definitionKey = CRYSTALLIZE_PIPELINE_DAG.key) {
    if (this.activeStarts.has(projectId)) {
      this.logger.warn(`startProject called concurrently for project ${projectId} — ignoring duplicate trigger`);
      const existing = await this.latestRun(projectId, ['RUNNING', 'PENDING']);
      if (existing) return this.runView(existing.id);
    }
    this.activeStarts.add(projectId);
    try {
      await this.cancelActiveRuns(projectId);
      await this.rkb.resetPipelineArtifacts(projectId);
      await this.stepRepo.delete({ projectId });
      await this.projectRepo.update(projectId, {
        status: 'DISCOVERING',
        currentStage: 'DISCOVERY',
        errorMessage: null,
      });
      return await this.startRun(projectId, definitionKey);
    } finally {
      this.activeStarts.delete(projectId);
    }
  }

  /** Pause the latest running run for a project. */
  async pauseProject(projectId: string) {
    const run = await this.latestRun(projectId, ['RUNNING', 'PENDING']);
    if (!run) throw new NotFoundException('No active run for this project');
    return this.pause(run.id);
  }

  /** Resume the latest paused / waiting / failed run for a project.
   *  If a checkpoint node is awaiting approval (WAITING_FOR_USER project
   *  status), it is automatically approved before continuing.
   *  Discovery only — gap-analysis review is handled via GapAnalysisService. */
  async resumeProject(projectId: string) {
    const run = await this.latestRun(projectId, ['PAUSED', 'WAITING_APPROVAL', 'FAILED', 'RUNNING']);
    if (!run) throw new NotFoundException('No resumable run for this project');
    const waitingNode = await this.nodeRepo.findOne({
      where: { runId: run.id, status: 'WAITING_APPROVAL' },
    });
    if (waitingNode) {
      if (waitingNode.nodeKey === 'gap-analysis') {
        throw new BadRequestException(
          'Gap analysis proposals are awaiting review — apply, reject, or stop them before continuing',
        );
      }
      return this.approveCheckpoint(run.id, waitingNode.nodeKey);
    }
    return this.resume(run.id);
  }

  /** Retry a single node (and its descendants) — used for regenerate-from-agent. */
  async regenerateNode(projectId: string, nodeKey: string) {
    const run = await this.latestRun(projectId);
    if (!run) throw new NotFoundException('No run for this project — call startProject first');
    await this.clearCascadeArtifacts(projectId, run.definitionKey, nodeKey);
    return this.retryNode(run.id, nodeKey);
  }

  /**
   * Clear knowledge + current document rows for a node and all descendants
   * before re-running, so regenerate does not leave duplicate RKB items.
   */
  private async clearCascadeArtifacts(
    projectId: string,
    definitionKey: string,
    nodeKey: string,
  ): Promise<void> {
    const def = getDagDefinition(definitionKey);
    const cascade = [nodeKey, ...descendantsOf(def, nodeKey)];
    const stages: string[] = [];
    for (const key of cascade) {
      await this.rkb.deleteKnowledgeByCreatedBy(projectId, key);
      const docType = NODE_DOCUMENT_TYPES[key];
      if (docType) {
        await this.rkb.deleteDocument(projectId, docType);
      }
      const stage = DAG_NODE_TO_STAGE[key];
      if (stage) stages.push(stage);
    }
    if (cascade.includes('validation') || cascade.includes('debate')) {
      await this.rkb.deleteValidationIssues(projectId);
    }
    if (stages.length > 0) {
      await this.stepRepo.update(
        { projectId, stage: In(stages) },
        {
          status: 'QUEUED',
          startedAt: null,
          completedAt: null,
          error: null,
        },
      );
    }
  }

  /** Recompile only the COMPILED_DOCUMENT for a project. */
  async recompileDocument(projectId: string) {
    const run = await this.latestRun(projectId);
    if (!run) throw new NotFoundException('No run for this project — call startProject first');
    return this.retryNode(run.id, 'compilation');
  }

  /** Regenerate only the BUILD_PROMPT_DOCUMENT for a project. */
  async regenerateBuildPrompt(projectId: string) {
    const run = await this.latestRun(projectId);
    if (!run) throw new NotFoundException('No run for this project — call startProject first');
    return this.retryNode(run.id, 'build-prompt');
  }

  /** Cancel the latest run for a project. */
  async cancelProject(projectId: string) {
    const run = await this.latestRun(projectId);
    if (!run) throw new NotFoundException('No run for this project');
    await this.cancelActiveRuns(projectId);
    await this.projectRepo.update(projectId, { status: 'CANCELLED', currentStage: null });
    return this.runView(run.id);
  }

  async getRunState(runId: string) {
    return this.runView(runId);
  }

  async getLatestRunState(projectId: string) {
    const run = await this.runRepo.findOne({
      where: { projectId },
      order: { createdAt: 'DESC' },
    });
    if (!run) return { run: null, nodes: [] };
    return this.runView(run.id);
  }

  // -------------------------------------------------------------------------
  // Execution internals
  // -------------------------------------------------------------------------

  private async executeRun(runId: string): Promise<void> {
    const run = await this.requireRun(runId);
    run.status = 'RUNNING';
    run.currentNodeKey = null;
    await this.saveRun(run);
    const plan = generatePlan(getDagDefinition(run.definitionKey));
    await this.syncProjectStatusPlan(run.projectId, plan, run.currentLevel);
    await this.executeFromLevel(runId, plan, run.currentLevel);
  }

  private async executeFromLevel(
    runId: string,
    plan: ExecutionPlan,
    startLevel: number,
  ): Promise<void> {
    for (let level = startLevel; level < plan.layers.length; level++) {
      const fresh = await this.requireRun(runId);
      if (fresh.status === 'PAUSED' || fresh.status === 'CANCELLED') return;
      fresh.currentLevel = level;
      fresh.currentNodeKey = null;
      await this.saveRun(fresh);
      await this.syncProjectStatusPlan(fresh.projectId, plan, level);

      const outcome = await this.runLayer(runId, fresh.projectId, plan, plan.layers[level]);

      if (outcome.pausedAt) {
        const run = await this.requireRun(runId);
        run.status = 'WAITING_APPROVAL';
        run.currentNodeKey = outcome.pausedAt;
        await this.saveRun(run);
        const stage = DAG_NODE_TO_STAGE[outcome.pausedAt];
        // Discovery / gap-analysis must keep human-wait statuses — do not
        // overwrite WAITING_FOR_USER with DISCOVERING (blocks confirm+resume).
        const projectStatus =
          CHECKPOINT_PROJECT_STATUS[outcome.pausedAt] ??
          (stage ? (stageToProjectStatus().get(stage) ?? 'RUNNING') : 'RUNNING');
        await this.projectRepo.update(run.projectId, {
          status: projectStatus,
          currentStage: stage ?? null,
        });
        this.logger.log(`DAG run ${runId} paused at checkpoint ${outcome.pausedAt}`);
        return;
      }
      if (outcome.failed.length > 0) {
        const run = await this.requireRun(runId);
        run.status = 'FAILED';
        run.currentNodeKey = outcome.failed[0].nodeKey;
        run.error = outcome.failed
          .map((f) => `${f.nodeKey}: ${f.error ?? 'failed'}`)
          .join('; ');
        await this.saveRun(run);
        await this.projectRepo.update(run.projectId, {
          status: 'FAILED',
          currentStage: DAG_NODE_TO_STAGE[outcome.failed[0].nodeKey] ?? null,
          errorMessage: run.error,
        });
        this.logger.warn(`DAG run ${runId} failed at level ${level}: ${run.error}`);
        return;
      }
    }
    const run = await this.requireRun(runId);
    run.status = 'COMPLETED';
    run.currentNodeKey = null;
    run.error = null;
    await this.saveRun(run);

    // Gap analysis may finish the DAG node while proposals still await human
    // review — keep GAP_ANALYSIS_REVIEW instead of falsely marking COMPLETED.
    let projectStatus = 'COMPLETED';
    let currentStage: string | null = null;
    const gapNode = await this.nodeRepo.findOne({
      where: { runId, nodeKey: 'gap-analysis' },
    });
    if (gapNode?.outputJson) {
      try {
        const out = JSON.parse(gapNode.outputJson) as { status?: string };
        if (out.status === 'AWAITING_REVIEW') {
          projectStatus = 'GAP_ANALYSIS_REVIEW';
          currentStage = 'GAP_ANALYSIS';
        }
      } catch {
        /* ignore malformed output */
      }
    }
    await this.projectRepo.update(run.projectId, {
      status: projectStatus,
      currentStage,
    });
    this.logger.log(`DAG run ${runId} completed (project status=${projectStatus})`);
  }

  private async runLayer(
    runId: string,
    projectId: string,
    plan: ExecutionPlan,
    layerKeys: string[],
  ): Promise<LayerOutcome> {
    const nodeRuns = await this.nodeRepo.find({
      where: { runId, nodeKey: In(layerKeys) },
    });
    const byKey = new Map(nodeRuns.map((n) => [n.nodeKey, n]));
    const failed: LayerOutcome['failed'] = [];
    const eligible: WorkflowDagNodeRun[] = [];

    for (const key of layerKeys) {
      const nr = byKey.get(key);
      if (!nr) continue;
      if (nr.status === 'COMPLETED' || nr.status === 'SKIPPED') continue;

      const disposition = await this.resolveDependencies(runId, nr);
      if (disposition === 'skip') {
        nr.status = 'SKIPPED';
        await this.saveNode(nr, projectId, runId);
        continue;
      }
      if (disposition === 'block') {
        nr.status = 'BLOCKED';
        if (nr.required) failed.push({ nodeKey: nr.nodeKey, error: 'a required dependency failed or was skipped' });
        await this.saveNode(nr, projectId, runId);
        continue;
      }
      nr.status = 'RUNNING';
      await this.saveNode(nr, projectId, runId);
      eligible.push(nr);
    }

    const configuredConcurrency = Number(process.env.DAG_CONCURRENCY ?? '');
    const baseConcurrency =
      Number.isFinite(configuredConcurrency) && configuredConcurrency > 0
        ? configuredConcurrency
        : this.concurrency;
    const activeConcurrency = process.env.LLM_PROVIDER === 'ollama' ? 1 : baseConcurrency;
    for (let i = 0; i < eligible.length; i += activeConcurrency) {
      const batch = eligible.slice(i, i + activeConcurrency);
      await Promise.all(batch.map((nr) => this.executeNode(runId, projectId, plan, nr)));
    }

    const pausedAt: string[] = [];
    for (const nr of eligible) {
      const fresh = await this.nodeRepo.findOne({ where: { id: nr.id } });
      if (!fresh) continue;
      if (fresh.status === 'WAITING_APPROVAL') pausedAt.push(fresh.nodeKey);
      else if (fresh.status === 'FAILED') failed.push({ nodeKey: fresh.nodeKey, error: fresh.error ?? undefined });
    }
    return { pausedAt: pausedAt[0] ?? null, failed };
  }

  private async resolveDependencies(
    runId: string,
    node: WorkflowDagNodeRun,
  ): Promise<'ready' | 'skip' | 'block'> {
    if (node.dependsOn.length === 0) return 'ready';
    const deps = await this.nodeRepo.find({
      where: { runId, nodeKey: In(node.dependsOn) },
    });
    const depByKey = new Map(deps.map((d) => [d.nodeKey, d]));
    for (const depKey of node.dependsOn) {
      const dep = depByKey.get(depKey);
      if (!dep || dep.status === 'PENDING' || dep.status === 'RUNNING') {
        return node.required ? 'block' : 'skip';
      }
      if (dep.status === 'FAILED' || dep.status === 'BLOCKED' || dep.status === 'SKIPPED') {
        return node.required ? 'block' : 'skip';
      }
    }
    return 'ready';
  }

  private async executeNode(
    runId: string,
    projectId: string,
    plan: ExecutionPlan,
    node: WorkflowDagNodeRun,
  ): Promise<void> {
    const meta = plan.nodeMeta[node.nodeKey];
    let executor: (ctx: NodeExecutionContext) => Promise<NodeExecutionResult>;
    try {
      executor = this.registry.get(node.nodeKey);
    } catch (err) {
      node.status = 'FAILED';
      node.error = err instanceof Error ? err.message : String(err);
      node.completedAt = new Date();
      await this.saveNode(node, projectId, runId);
      return;
    }

    const depOutputs: Record<string, unknown> = {};
    if (node.dependsOn.length > 0) {
      const deps = await this.nodeRepo.find({
        where: { runId, nodeKey: In(node.dependsOn) },
      });
      for (const d of deps) {
        if (d.status === 'COMPLETED' && d.outputJson) {
          try {
            depOutputs[d.nodeKey] = JSON.parse(d.outputJson);
          } catch {
            depOutputs[d.nodeKey] = d.outputJson;
          }
        }
      }
    }

    const maxAttempts = meta.retries + 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      node.startedAt = new Date();
      node.retryCount = attempt - 1;
      node.error = null;
      await this.saveNode(node, projectId, runId);
      try {
        const ctx: NodeExecutionContext = {
          runId,
          projectId,
          definitionKey: plan.definitionKey,
          nodeKey: node.nodeKey,
          attempt,
          deps: depOutputs,
        };
        const result = await this.runWithTimeout(executor, ctx, meta.timeoutMs);
        if (result.success) {
          node.status =
            node.checkpoint || result.pauseForApproval ? 'WAITING_APPROVAL' : 'COMPLETED';
          node.outputJson = result.output !== undefined ? JSON.stringify(result.output) : null;
          node.completedAt = new Date();
          await this.saveNode(node, projectId, runId);
          return;
        }
        node.error = result.error ?? 'executor reported failure';
      } catch (err) {
        node.error = err instanceof Error ? err.message : String(err);
      }
      await this.saveNode(node, projectId, runId);
    }
    node.status = 'FAILED';
    node.completedAt = new Date();
    await this.saveNode(node, projectId, runId);
  }

  private runWithTimeout(
    executor: (ctx: NodeExecutionContext) => Promise<NodeExecutionResult>,
    ctx: NodeExecutionContext,
    timeoutMs?: number,
  ): Promise<NodeExecutionResult> {
    if (!timeoutMs) return executor(ctx);
    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Node ${ctx.nodeKey} timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });
    return Promise.race([
      executor(ctx).finally(() => clearTimeout(timer)),
      timeoutPromise,
    ]);
  }

  private async resetFromLevel(runId: string, plan: ExecutionPlan, level: number): Promise<void> {
    const keys = new Set<string>();
    for (let l = level; l < plan.layers.length; l++) {
      for (const key of plan.layers[l]) keys.add(key);
    }
    if (keys.size === 0) return;
    const nodes = await this.nodeRepo.find({ where: { runId, nodeKey: In([...keys]) } });
    for (const node of nodes) {
      if (node.status === 'SKIPPED') continue;
      node.status = 'PENDING';
      node.error = null;
      node.outputJson = null;
      node.retryCount = 0;
      node.startedAt = null;
      node.completedAt = null;
    }
    await this.nodeRepo.save(nodes);
    const run = await this.requireRun(runId);
    run.currentLevel = level;
    run.error = null;
    run.currentNodeKey = null;
    await this.saveRun(run);
  }

  private async persistDefinition(def: DagDef): Promise<void> {
    const existing = await this.defRepo.findOne({ where: { key: def.key } });
    await this.defRepo.upsert(
      {
        id: existing?.id ?? randomUUID(),
        key: def.key,
        name: def.name,
        definitionJson: JSON.stringify(def),
      },
      ['key'],
    );
  }

  /** Mirror the active layer's first stage into the Project row so the
   *  workspace header / control bar switch out of the idle "Start analysis"
   *  state the moment a run begins or resumes. */
  private async syncProjectStatusPlan(
    projectId: string,
    plan: ExecutionPlan,
    level: number,
  ): Promise<void> {
    const layer = plan.layers[level];
    if (!layer?.length) return;
    const firstNode = layer[0];
    const stage = DAG_NODE_TO_STAGE[firstNode];
    const projectStatus = stage ? stageToProjectStatus().get(stage) : undefined;
    if (!stage || !projectStatus) return;
    await this.projectRepo.update(projectId, {
      status: projectStatus,
      currentStage: stage,
    });
  }

  private async requireRun(runId: string): Promise<WorkflowDagRun> {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException(`DAG run ${runId} not found`);
    return run;
  }

  private async saveRun(run: WorkflowDagRun): Promise<void> {
    await this.runRepo.save(run);
    this.events.publish({
      kind: 'run',
      projectId: run.projectId,
      runId: run.id,
      status: run.status as DagRunStatus,
      currentLevel: run.currentLevel,
      currentNodeKey: run.currentNodeKey,
      at: new Date().toISOString(),
    });
  }

  private async saveNode(node: WorkflowDagNodeRun, projectId: string, runId: string): Promise<void> {
    await this.nodeRepo.save(node);
    this.events.publish({
      kind: 'node',
      projectId,
      runId,
      nodeKey: node.nodeKey,
      status: node.status as DagNodeStatus,
      retryCount: node.retryCount,
      error: node.error,
      at: new Date().toISOString(),
    });
  }

  private async runView(runId: string) {
    const run = await this.requireRun(runId);
    const nodes = await this.nodeRepo.find({ where: { runId } });
    return {
      run: {
        id: run.id,
        projectId: run.projectId,
        definitionKey: run.definitionKey,
        status: run.status as DagRunStatus,
        currentLevel: run.currentLevel,
        currentNodeKey: run.currentNodeKey,
        error: run.error,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
      },
      nodes: nodes.map((n) => ({
        id: n.id,
        nodeKey: n.nodeKey,
        status: n.status as DagNodeStatus,
        dependsOn: n.dependsOn,
        required: n.required,
        checkpoint: n.checkpoint,
        retryCount: n.retryCount,
        maxRetries: n.maxRetries,
        error: n.error,
        output: n.outputJson ? safeParse(n.outputJson) : null,
        startedAt: n.startedAt,
        completedAt: n.completedAt,
      })),
    };
  }
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
