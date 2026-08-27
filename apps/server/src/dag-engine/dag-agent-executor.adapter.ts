import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project, WorkflowStep } from '../database/entities';
import { RkbService } from '../rkb/rkb.service';
import { GapAnalysisService } from '../gap-analysis/gap-analysis.service';
import { KnowledgeGraphService } from '../knowledge-graph/knowledge-graph.service';
import { WorkflowEventsService } from '../realtime/workflow-events.service';
import { DashboardService } from '../realtime/dashboard.service';
import { RunLogService, extractLowConfidenceFlags } from '../run-log/run-log.service';
import { DiscoveryCheckpointService } from '../checkpoint/discovery-checkpoint.service';
import { PipelineFoundationService } from '../foundation/integration/pipeline-foundation.service';
import { ContextEngineService } from '../foundation/context/context-engine.service';
import type { ContextTaskType } from '../foundation/context/context.types';
import { AgentExecution } from '../database/entities';
import { STAGE_TO_AGENT } from '../realtime/agent-phases';
import { digestKnowledgeItems } from '../agents/context-digest';
import type { AgentContext, AgentResult } from '../agents/types';
import { DiscoveryService } from '../agents/discovery.service';
import { ResearchService } from '../agents/research.service';
import { BusinessAnalystService } from '../agents/business-analyst.service';
import { ProductManagerService } from '../agents/product-manager.service';
import { RequirementsEngineerService } from '../agents/requirements-engineer.service';
import { UxService } from '../agents/ux.service';
import { DataArchitectService } from '../agents/data-architect.service';
import { AiArchitectService } from '../agents/ai-architect.service';
import { SolutionArchitectService } from '../agents/solution-architect.service';
import { SecurityService } from '../agents/security.service';
import { QaService } from '../agents/qa.service';
import { EstimationService } from '../agents/estimation.service';
import { CriticService } from '../agents/critic.service';
import { CompilerService } from '../agents/compiler.service';
import { DebateService } from '../agents/debate.service';
import { FrdService } from '../agents/frd.service';
import { UserStoriesService } from '../agents/user-stories.service';
import { TechArchService } from '../agents/tech-arch.service';
import { DbDesignService } from '../agents/db-design.service';
import { ApiSpecService } from '../agents/api-spec.service';
import { SowService } from '../agents/sow.service';
import { randomUUID } from 'crypto';
import { DAG_NODE_TO_STAGE } from './stage-mapping';
import type { NodeExecutionContext, NodeExecutionResult } from './types';
import { NodeExecutorRegistry } from './node-executor.registry';

/**
 * Real agent adapters: registers one executor per `crystallize-pipeline` node
 * that builds the AgentContext (project + shared knowledge + answered
 * questions + per-consumer digest) and runs the corresponding agent service,
 * persisting results through RkbService exactly like the sequential workflow.
 */

/** DAG node key -> consumer key used for AGENT_DIGEST_CONFIG tiering. */
const CONSUMER_KEY: Record<string, string> = {
  'build-prompt': 'build-prompt-generation',
  frd: 'frd-generation',
  'user-stories': 'user-stories-generation',
  'tech-arch': 'tech-arch-generation',
  'db-design': 'db-design-generation',
  'api-spec': 'api-spec-generation',
  sow: 'sow-generation',
};

/** DAG node key -> Context Engine task type (ranked context per agent). */
const NODE_TO_CONTEXT_TASK: Record<string, ContextTaskType> = {
  discovery: 'discovery',
  research: 'research',
  'business-analysis': 'requirements',
  'product-analysis': 'requirements',
  'requirements-engineering': 'requirements',
  'ux-design': 'ux',
  'data-architecture': 'database',
  'ai-architecture': 'architecture',
  'solution-architecture': 'architecture',
  'security-review': 'security',
  'qa-planning': 'testing',
  estimation: 'estimation',
  validation: 'validation',
  debate: 'validation',
  compilation: 'compilation',
  frd: 'document',
  'user-stories': 'document',
  'tech-arch': 'document',
  'db-design': 'document',
  'api-spec': 'document',
  sow: 'document',
  'build-prompt': 'document',
  'gap-analysis': 'gap_analysis',
};

/** DAG node key -> document type saved by RkbService.saveDocument. */
const DOCUMENT_TYPES: Record<string, string> = {
  'build-prompt': 'BUILD_PROMPT_DOCUMENT',
  compilation: 'COMPILED_DOCUMENT',
  frd: 'FRD_DOCUMENT',
  'user-stories': 'USER_STORIES_DOCUMENT',
  'tech-arch': 'TECH_ARCH_DOCUMENT',
  'db-design': 'DB_DESIGN_DOCUMENT',
  'api-spec': 'API_SPEC_DOCUMENT',
  sow: 'SOW_DOCUMENT',
};


@Injectable()
export class DagAgentExecutorAdapter {
  private readonly logger = new Logger(DagAgentExecutorAdapter.name);

  constructor(
    @InjectRepository(Project) private readonly projectRepo: Repository<Project>,
    @InjectRepository(WorkflowStep) private readonly stepRepo: Repository<WorkflowStep>,
    private readonly rkb: RkbService,
    private readonly discovery: DiscoveryService,
    private readonly research: ResearchService,
    private readonly businessAnalyst: BusinessAnalystService,
    private readonly productManager: ProductManagerService,
    private readonly requirementsEngineer: RequirementsEngineerService,
    private readonly ux: UxService,
    private readonly dataArchitect: DataArchitectService,
    private readonly aiArchitect: AiArchitectService,
    private readonly solutionArchitect: SolutionArchitectService,
    private readonly security: SecurityService,
    private readonly qa: QaService,
    private readonly estimation: EstimationService,
    private readonly critic: CriticService,
    private readonly debate: DebateService,
    private readonly compiler: CompilerService,
    private readonly frd: FrdService,
    private readonly userStories: UserStoriesService,
    private readonly techArch: TechArchService,
    private readonly dbDesign: DbDesignService,
    private readonly apiSpec: ApiSpecService,
    private readonly sow: SowService,
    private readonly gapAnalysis: GapAnalysisService,
    private readonly graph: KnowledgeGraphService,
    private readonly events: WorkflowEventsService,
    private readonly dashboard: DashboardService,
    private readonly runLog: RunLogService,
    private readonly discoveryCheckpoint: DiscoveryCheckpointService,
    private readonly foundation: PipelineFoundationService,
    private readonly contextEngine: ContextEngineService,
  ) {}

  registerAll(registry: NodeExecutorRegistry): void {
    const agents: Record<string, (ctx: AgentContext) => Promise<AgentResult>> = {
      discovery: (ctx) => this.discovery.run(ctx),
      research: (ctx) => this.research.run(ctx),
      'business-analysis': (ctx) => this.businessAnalyst.run(ctx),
      'product-analysis': (ctx) => this.productManager.run(ctx),
      'requirements-engineering': (ctx) => this.requirementsEngineer.run(ctx),
      'ux-design': (ctx) => this.ux.run(ctx),
      'data-architecture': (ctx) => this.dataArchitect.run(ctx),
      'ai-architecture': (ctx) => this.aiArchitect.run(ctx),
      'solution-architecture': (ctx) => this.solutionArchitect.run(ctx),
      'security-review': (ctx) => this.security.run(ctx),
      'qa-planning': (ctx) => this.qa.run(ctx),
      estimation: (ctx) => this.estimation.run(ctx),
      validation: (ctx) => this.critic.run(ctx),
      debate: (ctx) => this.debate.run(ctx),
      compilation: (ctx) => this.compiler.run(ctx),
      'build-prompt': (ctx) => this.compiler.buildPrompt(ctx),
      frd: (ctx) => this.frd.run(ctx),
      'user-stories': (ctx) => this.userStories.run(ctx),
      'tech-arch': (ctx) => this.techArch.run(ctx),
      'db-design': (ctx) => this.dbDesign.run(ctx),
      'api-spec': (ctx) => this.apiSpec.run(ctx),
      sow: (ctx) => this.sow.run(ctx),
    };
    for (const [nodeKey, run] of Object.entries(agents)) {
      registry.register(nodeKey, (execCtx) => this.executeAgent(nodeKey, run, execCtx));
    }
    registry.register('gap-analysis', (execCtx) => this.executeGapAnalysis(execCtx));
  }

  private async executeAgent(
    nodeKey: string,
    run: (ctx: AgentContext) => Promise<AgentResult>,
    execCtx: NodeExecutionContext,
  ): Promise<NodeExecutionResult> {
    // Digest / skill keys may differ (e.g. frd → frd-generation); activity +
    // executions use the DAG node key so UI live panels match.
    const digestKey = CONSUMER_KEY[nodeKey] ?? nodeKey;
    const agentKey = nodeKey;
    const startedAt = new Date();
    let executionId: string | undefined;
    try {
      await this.markStep(execCtx.projectId, nodeKey, 'RUNNING');
      this.events.emitStageUpdated(execCtx.projectId, {
        stage: DAG_NODE_TO_STAGE[nodeKey] ?? nodeKey.toUpperCase().replace(/-/g, '_'),
        status: 'RUNNING',
        startedAt: startedAt.toISOString(),
        completedAt: null,
        durationMs: null,
        error: null,
      });
      executionId = await this.rkb.startExecution(execCtx.projectId, agentKey);
      this.events.startActivityPhases(execCtx.projectId, agentKey);
      this.events.emitExecutionUpdated(execCtx.projectId, {
        executionId,
        agentKey,
        status: 'RUNNING',
        inputTokens: 0,
        outputTokens: 0,
        model: null,
      });
      void this.dashboard?.buildSnapshot?.(execCtx.projectId).catch(() => {});

      const agentCtx = await this.buildContext(execCtx.projectId, nodeKey);
      const result = await run(agentCtx);
      await this.persistResult(execCtx.projectId, nodeKey, result);

      if (result.knowledgeItems.length > 0) {
        this.events.emitKnowledgeCreated(
          execCtx.projectId,
          result.knowledgeItems.map((item) => ({
            type: item.type,
            title: item.title,
            externalId: item.externalId ?? null,
            source: item.sourceCategory
              ? `${nodeKey}::${item.sourceCategory}`
              : nodeKey,
          })),
        );
      }

      // Foundation integration: dual-write canonical items + run quality gate
      // (best-effort — a foundation failure never breaks the pipeline stage).
      if (result.success && result.knowledgeItems.length > 0) {
        try {
          await this.foundation.persistCanonicalFromAgent(
            execCtx.projectId,
            digestKey,
            result.knowledgeItems,
          );
        } catch (err) {
          this.logger.warn(
            `Canonical dual-write failed for ${digestKey} (${execCtx.projectId}): ${err instanceof Error ? err.message : err}`,
          );
        }
        try {
          await this.foundation.evaluateCanonicalArtifacts(execCtx.projectId);
        } catch (err) {
          this.logger.warn(
            `Quality evaluation failed for ${digestKey} (${execCtx.projectId}): ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      // Foundation auto-compile + completion quality: after compilation completes.
      if (nodeKey === 'compilation' && result.success) {
        try {
          await this.foundation.generateCompiledDocuments(execCtx.projectId);
        } catch (err) {
          this.logger.warn(
            `Auto-compile failed (${execCtx.projectId}): ${err instanceof Error ? err.message : err}`,
          );
        }
        try {
          await this.foundation.evaluateProjectAtCompletion(execCtx.projectId);
        } catch (err) {
          this.logger.warn(
            `Completion quality failed (${execCtx.projectId}): ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      const completedAt = new Date();
      await this.markStep(
        execCtx.projectId,
        nodeKey,
        result.success ? 'COMPLETED' : 'FAILED',
        result.success ? null : 'agent reported failure',
      );

      // Discovery checkpoint: persist interpretation before the run pauses.
      if (nodeKey === 'discovery' && result?.discoveryCheckpoint) {
        await this.discoveryCheckpoint.upsert(execCtx.projectId, result.discoveryCheckpoint);
        await this.projectRepo.update(execCtx.projectId, {
          status: 'WAITING_FOR_USER',
          currentStage: 'DISCOVERY',
        });
        this.events.emitProjectStatus(execCtx.projectId, {
          status: 'WAITING_FOR_USER',
          currentStage: 'DISCOVERY',
        });
      }

      const tokens = result._tokens ?? { inputTokens: 0, outputTokens: 0, model: 'unknown' };
      await this.rkb.completeExecution(executionId, tokens);

      this.events.completeActivityPhases(execCtx.projectId, agentKey);
      this.events.emitStageUpdated(execCtx.projectId, {
        stage: DAG_NODE_TO_STAGE[nodeKey] ?? nodeKey.toUpperCase().replace(/-/g, '_'),
        status: result.success ? 'COMPLETED' : 'FAILED',
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        error: result.success ? null : 'agent reported failure',
      });
      this.events.emitExecutionUpdated(execCtx.projectId, {
        executionId,
        agentKey,
        status: result.success ? 'COMPLETED' : 'FAILED',
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        model: tokens.model ?? 'unknown',
        error: result.success ? null : 'agent reported failure',
      });
      try {
        const snapshot = await this.dashboard.buildSnapshot(execCtx.projectId);
        this.events.emitDashboardSnapshot(execCtx.projectId, snapshot);
      } catch {
        /* non-blocking */
      }
      if (result?.reasoningTraces?.length) {
        this.events.emitReasoningTrace(execCtx.projectId, agentKey, result.reasoningTraces);
      }
      try {
        const lowConf = extractLowConfidenceFlags(result.knowledgeItems, 0.6);
        if (lowConf.length > 0) {
          await this.runLog.logLowConfidence(
            execCtx.projectId,
            agentKey,
            'Low confidence knowledge items detected',
            { flags: lowConf },
          );
        }
      } catch {
        /* non-blocking */
      }

      return {
        success: result.success,
        output: {
          agentKey: result.agentKey,
          knowledgeItems: result.knowledgeItems.length,
          documentType: result.documentContent ? (DOCUMENT_TYPES[nodeKey] ?? null) : undefined,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.events.stopActivityPhases(execCtx.projectId, agentKey);
      if (executionId) await this.rkb.failExecution(executionId, message);
      await this.markStep(execCtx.projectId, nodeKey, 'FAILED', message);
      this.events.emitStageUpdated(execCtx.projectId, {
        stage: DAG_NODE_TO_STAGE[nodeKey] ?? nodeKey.toUpperCase().replace(/-/g, '_'),
        status: 'FAILED',
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        error: message,
      });
      return { success: false, error: message };
    }
  }

  /** Mirror DAG node progress into the sequential workflow_steps table AND the
   * project status/currentStage columns so the main pipeline visualization,
   * workspace header, dashboard, and control bar stay in lock-step with DAG
   * execution (same values the sequential workflow writes). */
  private async markStep(
    projectId: string,
    nodeKey: string,
    status: 'RUNNING' | 'COMPLETED' | 'FAILED',
    error: string | null = null,
  ): Promise<void> {
    const stage = DAG_NODE_TO_STAGE[nodeKey];
    if (!stage) return;
    let step = await this.stepRepo.findOne({ where: { projectId, stage } });
    if (!step) {
      step = this.stepRepo.create({
        id: randomUUID(),
        projectId,
        stage,
        status,
      });
    } else {
      step.status = status;
    }
    if (status === 'RUNNING') {
      step.startedAt = new Date();
      step.error = null;
    }
    if (status === 'COMPLETED') {
      step.completedAt = new Date();
      step.error = null;
    }
    if (status === 'FAILED') {
      step.error = error;
    }
    await this.stepRepo.save(step);
    await this.syncProject(projectId, stage, status, error);
  }

  /** Keep the Project row in sync so the main header / control bar reflect
   *  the DAG progress rather than staying idle on "Start analysis".
   *  RUNNING does not overwrite project.status — parallel layers would thrash
   *  the header; level sync in DagEngineService owns status transitions. */
  private async syncProject(
    projectId: string,
    stage: string,
    status: 'RUNNING' | 'COMPLETED' | 'FAILED',
    error: string | null,
  ): Promise<void> {
    if (status === 'RUNNING') {
      await this.projectRepo.update(projectId, { currentStage: stage });
    } else if (status === 'FAILED') {
      await this.projectRepo.update(projectId, {
        status: 'FAILED',
        currentStage: stage,
        errorMessage: error ?? `Stage ${stage} failed`,
      });
    }
  }

  private async executeGapAnalysis(execCtx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const startedAt = new Date();
    try {
      await this.markStep(execCtx.projectId, 'gap-analysis', 'RUNNING');
      this.events.emitStageUpdated(execCtx.projectId, {
        stage: 'GAP_ANALYSIS',
        status: 'RUNNING',
        startedAt: startedAt.toISOString(),
        completedAt: null,
        durationMs: null,
        error: null,
      });
      this.events.startActivityPhases(execCtx.projectId, 'gap-analysis');

      const { started } = await this.gapAnalysis.startRun(execCtx.projectId);
      // Analysis completes when the run leaves the running/starting phases.
      // Proposal review continues via the existing gap-analysis endpoints.
      const timeoutMs = process.env.GAP_ANALYSIS_TIMEOUT_MS
        ? parseInt(process.env.GAP_ANALYSIS_TIMEOUT_MS, 10)
        : 15 * 60 * 1000;
      const deadline = Date.now() + (isNaN(timeoutMs) ? 15 * 60 * 1000 : timeoutMs);
      while (Date.now() < deadline) {
        const { activeRun } = await this.gapAnalysis.getRunStatus(execCtx.projectId);
        if (!activeRun) {
          await this.markStep(execCtx.projectId, 'gap-analysis', 'FAILED', 'gap-analysis active run not found');
          return { success: false, error: 'gap-analysis active run not found' };
        }
        if (activeRun.status === 'COMPLETED' || activeRun.status === 'AWAITING_REVIEW') {
          await this.markStep(execCtx.projectId, 'gap-analysis', 'COMPLETED');
          this.events.completeActivityPhases(execCtx.projectId, 'gap-analysis');
          this.events.emitStageUpdated(execCtx.projectId, {
            stage: 'GAP_ANALYSIS',
            status: 'COMPLETED',
            startedAt: startedAt.toISOString(),
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - startedAt.getTime(),
            error: null,
          });
          return { success: true, output: { started, status: activeRun.status } };
        }
        if (activeRun.status === 'FAILED' || activeRun.status === 'CANCELLED') {
          await this.markStep(
            execCtx.projectId,
            'gap-analysis',
            'FAILED',
            `gap-analysis run ${activeRun.status}`,
          );
          this.events.stopActivityPhases(execCtx.projectId, 'gap-analysis');
          return { success: false, error: `gap-analysis run ${activeRun.status}` };
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      await this.markStep(execCtx.projectId, 'gap-analysis', 'FAILED', 'gap-analysis timed out');
      return { success: false, error: 'gap-analysis timed out waiting for completion' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.markStep(execCtx.projectId, 'gap-analysis', 'FAILED', message);
      this.events.stopActivityPhases(execCtx.projectId, 'gap-analysis');
      return { success: false, error: message };
    }
  }

  private async buildContext(projectId: string, nodeKey: string): Promise<AgentContext> {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) throw new Error(`Project ${projectId} not found`);
    const rawItems = await this.rkb.getKnowledgeContext(projectId);
    const consumerKey = CONSUMER_KEY[nodeKey] ?? nodeKey;
    const enriched = await this.foundation.enrichKnowledgeWithCanonical(projectId, rawItems);
    const knowledgeItems = digestKnowledgeItems(enriched, consumerKey);
    const answeredQuestions = await this.rkb.getAnsweredQuestions(projectId);
    const context: AgentContext = {
      projectId,
      projectName: project.name,
      idea: project.idea,
      knowledgeItems,
      answeredQuestions,
      domain: project.domain ?? undefined,
    };
    // Context Engine integration: overlay ranked, task-specific context
    // (best-effort — a context failure falls back to the digest path).
    const taskType = NODE_TO_CONTEXT_TASK[nodeKey];
    if (taskType) {
      try {
        const pkg = await this.contextEngine.compile({
          projectId,
          agentSkill: consumerKey,
          taskType,
        });
        if (pkg.relevantArtifacts.length > 0) {
          const ranked = pkg.relevantArtifacts.map((c) => ({
            externalId: c.source.externalId,
            type: c.source.kind,
            title: c.title,
            description: c.summary ?? null,
            status: 'CONFIRMED' as const,
            source: c.source.producer ?? null,
            confidence: c.confidence ?? null,
          }));
          const known = new Set(knowledgeItems.map((k) => k.externalId).filter((x): x is string => !!x));
          const merged = [...knowledgeItems];
          for (const item of ranked) {
            if (item.externalId && !known.has(item.externalId)) merged.push(item);
          }
          context.knowledgeItems = merged;
        }
      } catch (err) {
        this.logger.warn(
          `Context engine enrichment failed for ${nodeKey} (${projectId}): ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    // Validation and debate evaluate consistency — surface conflicts_with pairs.
    if (nodeKey === 'validation' || nodeKey === 'debate') {
      const pairs = await this.graph.getConflictPairs(projectId);
      context.conflicts = pairs.map((p) => ({
        sourceId: p.source.id,
        sourceTitle: p.source.title,
        sourceDomain: p.source.domain,
        targetId: p.target.id,
        targetTitle: p.target.title,
        targetDomain: p.target.domain,
        relation: p.relation,
        reason: p.reason ? (p.reason['reason'] as string | undefined) : undefined,
      }));
    }
    return context;
  }

  private async persistResult(
    projectId: string,
    nodeKey: string,
    result: AgentResult,
  ): Promise<void> {
    if (result.knowledgeItems.length > 0) {
      await this.rkb.saveKnowledgeItems(projectId, result.knowledgeItems, nodeKey);
    }
    if (result.questions.length > 0) {
      await this.rkb.saveQuestions(projectId, result.questions);
    }
    if (result.validationIssues && result.validationIssues.length > 0) {
      await this.rkb.saveValidationIssues(projectId, result.validationIssues, nodeKey);
    }
    if (result.documentContent) {
      const docType = DOCUMENT_TYPES[nodeKey] ?? 'COMPILED_DOCUMENT';
      await this.rkb.saveDocument(
        projectId,
        result.documentContent,
        `DAG node ${nodeKey} completed`,
        nodeKey,
        docType,
      );
    }
  }
}
