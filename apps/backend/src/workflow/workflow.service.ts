import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Project, WorkflowStep } from '../database/entities';
import { RkbService } from '../rkb/rkb.service';
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
import { DebateService } from "../agents/debate.service";
import { WorkflowEventsService } from '../realtime/workflow-events.service';
import { DashboardService } from '../realtime/dashboard.service';
import type { AgentContext, AgentResult } from '../agents/types';

/** Full PRD pipeline order (15 agents). */
const STAGES = [
  { key: 'DISCOVERY', projectStatus: 'DISCOVERING' },
  { key: 'RESEARCH', projectStatus: 'RESEARCHING' },
  { key: 'BUSINESS_ANALYSIS', projectStatus: 'ANALYSING' },
  { key: 'PRODUCT_ANALYSIS', projectStatus: 'ANALYSING' },
  { key: 'REQUIREMENTS_ENGINEERING', projectStatus: 'GENERATING_REQUIREMENTS' },
  { key: 'UX_DESIGN', projectStatus: 'DESIGNING' },
  { key: 'DATA_ARCHITECTURE', projectStatus: 'ARCHITECTING' },
  { key: 'AI_ARCHITECTURE', projectStatus: 'ARCHITECTING' },
  { key: 'SOLUTION_ARCHITECTURE', projectStatus: 'ARCHITECTING' },
  { key: 'SECURITY_REVIEW', projectStatus: 'SECURITY_REVIEW' },
  { key: 'QA_PLANNING', projectStatus: 'QA_ANALYSIS' },
  { key: 'ESTIMATION', projectStatus: 'ESTIMATING' },
  { key: 'VALIDATION', projectStatus: 'VALIDATING' },
  { key: 'DEBATE', projectStatus: 'VALIDATING' },
  { key: 'COMPILATION', projectStatus: 'COMPILING' },
] as const;

type StageKey = (typeof STAGES)[number]['key'];

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

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
    private readonly compiler: CompilerService,
    private readonly debate: DebateService,
    private readonly events: WorkflowEventsService,
    private readonly dashboard: DashboardService,
  ) {}

  private get agentMap(): Record<StageKey, (ctx: AgentContext) => Promise<AgentResult>> {
    return {
      DISCOVERY: (ctx) => this.discovery.run(ctx),
      RESEARCH: (ctx) => this.research.run(ctx),
      BUSINESS_ANALYSIS: (ctx) => this.businessAnalyst.run(ctx),
      PRODUCT_ANALYSIS: (ctx) => this.productManager.run(ctx),
      REQUIREMENTS_ENGINEERING: (ctx) => this.requirementsEngineer.run(ctx),
      UX_DESIGN: (ctx) => this.ux.run(ctx),
      DATA_ARCHITECTURE: (ctx) => this.dataArchitect.run(ctx),
      AI_ARCHITECTURE: (ctx) => this.aiArchitect.run(ctx),
      SOLUTION_ARCHITECTURE: (ctx) => this.solutionArchitect.run(ctx),
      SECURITY_REVIEW: (ctx) => this.security.run(ctx),
      QA_PLANNING: (ctx) => this.qa.run(ctx),
      ESTIMATION: (ctx) => this.estimation.run(ctx),
      VALIDATION: (ctx) => this.critic.run(ctx),
      DEBATE: (ctx) => this.debate.run(ctx),
      COMPILATION: (ctx) => this.compiler.run(ctx),
    };
  }

  private async pushDashboard(projectId: string): Promise<void> {
    try {
      const snapshot = await this.dashboard.buildSnapshot(projectId);
      this.events.emitDashboardSnapshot(projectId, snapshot);
    } catch (err) {
      this.logger.warn(`Failed to push dashboard snapshot: ${err}`);
    }
  }

  async createWorkflowSteps(projectId: string): Promise<void> {
    await this.stepRepo.delete({ projectId });
    await this.stepRepo.save(
      STAGES.map((s) =>
        this.stepRepo.create({
          id: randomUUID(),
          projectId,
          stage: s.key,
          status: 'QUEUED',
        }),
      ),
    );
  }

  async prepareResume(projectId: string): Promise<{
    resumeStage: StageKey;
    projectStatus: string;
  }> {
    let steps = await this.stepRepo.find({ where: { projectId } });

    if (steps.length === 0) {
      await this.createWorkflowSteps(projectId);
      return { resumeStage: 'DISCOVERY', projectStatus: 'DISCOVERING' };
    }

    const existingStages = new Set(steps.map((s) => s.stage));
    const missing = STAGES.filter((s) => !existingStages.has(s.key));
    if (missing.length > 0) {
      await this.stepRepo.save(
        missing.map((s) =>
          this.stepRepo.create({
            id: randomUUID(),
            projectId,
            stage: s.key,
            status: 'QUEUED',
          }),
        ),
      );
      steps = await this.stepRepo.find({ where: { projectId } });
    }

    const firstIncompleteIndex = STAGES.findIndex((stage) => {
      const step = steps.find((s) => s.stage === stage.key);
      return !step || step.status !== 'COMPLETED';
    });

    if (firstIncompleteIndex === -1) {
      const last = STAGES[STAGES.length - 1];
      await this.resetStageForRetry(projectId, last.key);
      return { resumeStage: last.key, projectStatus: last.projectStatus };
    }

    for (let i = firstIncompleteIndex; i < STAGES.length; i++) {
      await this.resetStageForRetry(projectId, STAGES[i].key);
    }

    const resume = STAGES[firstIncompleteIndex];
    return { resumeStage: resume.key, projectStatus: resume.projectStatus };
  }

  private async resetStageForRetry(projectId: string, stageKey: StageKey): Promise<void> {
    const agentKey = stageKey.toLowerCase().replace(/_/g, '-');
    await this.stepRepo.update(
      { projectId, stage: stageKey },
      {
        status: 'QUEUED',
        startedAt: null,
        completedAt: null,
        error: null,
      },
    );
    await this.rkb.deleteKnowledgeBySource(projectId, agentKey);
    if (stageKey === 'VALIDATION') {
      await this.rkb.deleteValidationIssues(projectId);
    }
    if (stageKey === 'COMPILATION') {
      await this.rkb.deleteDocument(projectId);
    }
  }

  private async buildContext(projectId: string): Promise<AgentContext> {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) throw new Error(`Project ${projectId} not found`);
    const knowledgeItems = await this.rkb.getKnowledgeContext(projectId);
    const answeredQuestions = await this.rkb.getAnsweredQuestions(projectId);
    return {
      projectId,
      projectName: project.name,
      idea: project.idea,
      knowledgeItems,
      answeredQuestions,
      domain: project.domain ?? undefined,
    };
  }

  async runWorkflow(projectId: string): Promise<void> {
    this.logger.log(`Starting workflow for project ${projectId}`);
    try {
      const steps = await this.stepRepo.find({ where: { projectId } });
      await this.pushDashboard(projectId);

      for (const stage of STAGES) {
        const project = await this.projectRepo.findOne({ where: { id: projectId } });
        if (!project || project.status === 'CANCELLED') {
          this.logger.log(`Workflow cancelled for project ${projectId}`);
          this.events.emitProjectStatus(projectId, {
            status: 'CANCELLED',
            currentStage: null,
          });
          await this.pushDashboard(projectId);
          return;
        }

        if (project.status === 'PAUSED') {
          this.logger.log(`Workflow paused for project ${projectId}`);
          this.events.emitProjectStatus(projectId, {
            status: 'PAUSED',
            currentStage: project.currentStage,
          });
          await this.pushDashboard(projectId);
          return;
        }

        const step = steps.find((s) => s.stage === stage.key);
        if (!step) continue;
        if (step.status === 'COMPLETED') continue;

        const agentKey = stage.key.toLowerCase().replace(/_/g, '-');
        const executionId = await this.rkb.startExecution(projectId, agentKey);
        const startedAt = new Date();

        try {
          await this.stepRepo.update(step.id, { status: 'RUNNING', startedAt });
          await this.projectRepo.update(projectId, {
            status: stage.projectStatus,
            currentStage: stage.key,
          });

          this.events.emitProjectStatus(projectId, {
            status: stage.projectStatus,
            currentStage: stage.key,
          });
          this.events.emitStageUpdated(projectId, {
            stage: stage.key,
            status: 'RUNNING',
            startedAt: startedAt.toISOString(),
          });
          this.events.emitExecutionUpdated(projectId, {

            executionId,
            agentKey,
            status: 'RUNNING',
          });
          this.events.startActivityPhases(projectId, agentKey);
          await this.pushDashboard(projectId);

          const ctx = await this.buildContext(projectId);
          const result = await this.agentMap[stage.key](ctx);

          if (result.knowledgeItems.length > 0) {
            await this.rkb.saveKnowledgeItems(projectId, result.knowledgeItems, agentKey);
            this.events.emitKnowledgeCreated(
              projectId,
              result.knowledgeItems.map((i) => ({
                type: i.type,
                title: i.title,
                externalId: i.externalId ?? null,
                source: agentKey,
              })),
            );
          }
          if (result.questions.length > 0) {
            await this.rkb.saveQuestions(projectId, result.questions);
          }
          if (result.validationIssues?.length) {
            await this.rkb.saveValidationIssues(projectId, result.validationIssues, agentKey);
          }
          if (result.documentContent) {
            await this.rkb.saveDocument(projectId, result.documentContent, `Stage ${stage.key} completed with knowledge items`, stage.key);
          }

          const tokens = result._tokens ?? { inputTokens: 0, outputTokens: 0, model: 'unknown' };
          await this.rkb.completeExecution(executionId, tokens);
          const completedAt = new Date();
          await this.stepRepo.update(step.id, { status: 'COMPLETED', completedAt });
          step.status = 'COMPLETED';
          step.completedAt = completedAt;

          this.events.completeActivityPhases(projectId, agentKey);
          this.events.emitStageUpdated(projectId, {
            stage: stage.key,
            status: 'COMPLETED',
            startedAt: startedAt.toISOString(),
            completedAt: completedAt.toISOString(),
            durationMs: completedAt.getTime() - startedAt.getTime(),
          });
          this.events.emitExecutionUpdated(projectId, {
            executionId,
            agentKey,
            status: 'COMPLETED',
            inputTokens: tokens.inputTokens,
            outputTokens: tokens.outputTokens,
            model: tokens.model,
          });
          if (result.reasoningTraces?.length) {
            this.events.emitReasoningTrace(projectId, stage.key, result.reasoningTraces);
          }

          await this.pushDashboard(projectId);
          this.logger.log(`Stage ${stage.key} completed for project ${projectId}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(`Stage ${stage.key} failed for project ${projectId}: ${msg}`);
          this.events.stopActivityPhases(projectId, agentKey);
          await this.rkb.failExecution(executionId, msg);
          await this.stepRepo.update(step.id, {
            status: 'FAILED',
            completedAt: new Date(),
            error: msg,
          });
          await this.projectRepo.update(projectId, {
            status: 'FAILED',
            errorMessage: `Stage ${stage.key} failed: ${msg}`,
          });
          this.events.emitStageUpdated(projectId, {
            stage: stage.key,
            status: 'FAILED',
            error: msg,
            completedAt: new Date().toISOString(),
          });
          this.events.emitExecutionUpdated(projectId, {
            executionId,
            agentKey,
            status: 'FAILED',
            error: msg,
          });
          this.events.emitProjectStatus(projectId, {
            status: 'FAILED',
            currentStage: stage.key,
            errorMessage: msg,
          });
          await this.pushDashboard(projectId);
          return;
        }
      }

      await this.projectRepo.update(projectId, { status: 'COMPLETED', currentStage: null });
      this.events.emitProjectStatus(projectId, {
        status: 'COMPLETED',
        currentStage: null,
      });
      await this.pushDashboard(projectId);
      this.logger.log(`Workflow completed for project ${projectId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Workflow crashed for project ${projectId}: ${msg}`);
      await this.projectRepo.update(projectId, { status: 'FAILED', errorMessage: msg });
      this.events.emitProjectStatus(projectId, {
        status: 'FAILED',
        currentStage: null,
        errorMessage: msg,
      });
      await this.pushDashboard(projectId);
    }
  }

  async regenerateFromAgent(projectId: string, agentKey: string): Promise<string> {
    // Convert agentKey to stage key (e.g., "requirements-engineering" -> "REQUIREMENTS_ENGINEERING")
    const targetStage = agentKey.toUpperCase().replace(/-/g, '_') as StageKey;
    const stageIndex = STAGES.findIndex((s) => s.key === targetStage);
    if (stageIndex === -1) {
      throw new Error(`Unknown agent: ${agentKey}`);
    }

    this.logger.log(`Regenerating from stage ${targetStage} (index ${stageIndex}) for project ${projectId}`);

    // Reset all steps from this stage onwards
    const steps = await this.stepRepo.find({ where: { projectId } });
    for (let i = stageIndex; i < STAGES.length; i++) {
      const step = steps.find((s) => s.stage === STAGES[i].key);
      if (step) {
        await this.stepRepo.update(step.id, { status: 'QUEUED', startedAt: null, completedAt: null, error: null });
      }
    }

    // Delete knowledge items from this and subsequent agents
    for (let i = stageIndex; i < STAGES.length; i++) {
      const sk = STAGES[i].key.toLowerCase().replace(/_/g, '-');
      await this.rkb.deleteKnowledgeByCreatedBy(projectId, sk);
    }

    // Delete the document and versions so it gets regenerated
    await this.rkb.deleteDocument(projectId);

    // Clear project error if any
    await this.projectRepo.update(projectId, { errorMessage: null, status: 'QUEUED' });

    return targetStage;
  }

  async recompileDocument(projectId: string): Promise<void> {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) throw new Error(`Project ${projectId} not found`);

    const executionId = await this.rkb.startExecution(projectId, 'compiler');
    try {
      await this.projectRepo.update(projectId, {
        status: 'COMPILING',
        currentStage: 'COMPILATION',
        errorMessage: null,
      });
      this.events.emitProjectStatus(projectId, {
        status: 'COMPILING',
        currentStage: 'COMPILATION',
      });
      this.events.startActivityPhases(projectId, 'compiler');
      await this.pushDashboard(projectId);

      const ctx = await this.buildContext(projectId);
      const result = await this.compiler.run(ctx);
      if (!result.documentContent) {
        throw new Error('Compiler produced no document content');
      }
      await this.rkb.saveDocument(projectId, result.documentContent, `Recompilation triggered`, 'recompilation');
      const tokens = result._tokens ?? {
        inputTokens: 0,
        outputTokens: 0,
        model: 'deterministic-compiler',
      };
      await this.rkb.completeExecution(executionId, tokens);

      const step = await this.stepRepo.findOne({
        where: { projectId, stage: 'COMPILATION' },
      });
      if (step) {
        await this.stepRepo.update(step.id, {
          status: 'COMPLETED',
          completedAt: new Date(),
          error: null,
        });
      }

      this.events.completeActivityPhases(projectId, 'compiler');
      await this.projectRepo.update(projectId, {
        status: 'COMPLETED',
        currentStage: null,
      });
      this.events.emitProjectStatus(projectId, {
        status: 'COMPLETED',
        currentStage: null,
      });
      this.events.emitExecutionUpdated(projectId, {
        executionId,
        agentKey: 'compiler',
        status: 'COMPLETED',
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        model: tokens.model,
      });
      await this.pushDashboard(projectId);
      this.logger.log(`Document recompiled for project ${projectId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.events.stopActivityPhases(projectId, 'compiler');
      await this.rkb.failExecution(executionId, msg);
      await this.projectRepo.update(projectId, {
        status: project.status === 'CREATED' ? 'FAILED' : project.status,
        errorMessage: `Recompile failed: ${msg}`,
      });
      this.events.emitProjectStatus(projectId, {
        status: 'FAILED',
        currentStage: 'COMPILATION',
        errorMessage: msg,
      });
      await this.pushDashboard(projectId);
      throw err;
    }
  }
}
