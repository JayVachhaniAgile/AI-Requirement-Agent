import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, Like } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  Project,
  KnowledgeItem,
  WorkflowStep,
  AgentExecution,
  ClarificationQuestion,
  ValidationIssue,
  Document,
  DocumentVersion,
  WorkflowDagRun,
  WorkflowDagNodeRun,
  GapAnalysisRun,
  GapAnalysisActiveRun,
  GapAnalysisProposal,
  DiscoveryCheckpoint,
  ModelUsage,
  RunLog,
  Artifact,
  ArtifactVersion,
  ArtifactDependency,
} from '../database/entities';
import { DagEngineService } from '../dag-engine/dag-engine.service';
import { DashboardService } from '../realtime/dashboard.service';
import { WorkflowEventsService } from '../realtime/workflow-events.service';
import { DomainService } from '../agents/domain.service';
import { LlmService } from '../llm/llm.service';
import { DiscoveryCheckpointService } from '../checkpoint/discovery-checkpoint.service';
import { RunLogService } from '../run-log/run-log.service';
import { GapAnalysisService } from '../gap-analysis/gap-analysis.service';
import { PIPELINE_STAGES, AGENT_TO_STAGE } from '../dag-engine/pipeline.config';
import { CreateProjectDto } from './dto/create-project.dto';
import { AnswerQuestionDto } from './dto/answer-question.dto';
import { ConfirmDiscoveryDto } from './dto/confirm-discovery.dto';

const RESTARTABLE_STATUSES = [
  'CREATED',
  'FAILED',
  'WAITING_FOR_USER',
  'PAUSED',
  'GAP_ANALYSIS_REVIEW',
  'COMPLETED',
];

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectRepository(Project) private readonly projectRepo: Repository<Project>,
    @InjectRepository(KnowledgeItem) private readonly knowledgeRepo: Repository<KnowledgeItem>,
    @InjectRepository(WorkflowStep) private readonly stepRepo: Repository<WorkflowStep>,
    @InjectRepository(AgentExecution) private readonly executionRepo: Repository<AgentExecution>,
    @InjectRepository(ClarificationQuestion)
    private readonly questionRepo: Repository<ClarificationQuestion>,
    @InjectRepository(ValidationIssue) private readonly issueRepo: Repository<ValidationIssue>,
    @InjectRepository(Document) private readonly documentRepo: Repository<Document>,
    @InjectRepository(DocumentVersion) private readonly docVersionRepo: Repository<DocumentVersion>,
    private readonly dataSource: DataSource,
    private readonly dagEngine: DagEngineService,
    private readonly dashboard: DashboardService,
    private readonly events: WorkflowEventsService,
    private readonly domainService: DomainService,
    private readonly llm: LlmService,
    private readonly discoveryCheckpoint: DiscoveryCheckpointService,
    private readonly runLog: RunLogService,
    private readonly gapAnalysis: GapAnalysisService,
  ) {}

  async list(): Promise<Project[]> {
    return this.projectRepo.find({ order: { createdAt: 'DESC' } });
  }

  async create(dto: CreateProjectDto): Promise<Project> {
    let domain = dto.domain;
    if (!domain) {
      domain = this.domainService.detectByKeywords(dto.idea);
      this.logger.log(`Detected domain "${domain}" for project "${dto.name}"`);
    }
    const project = this.projectRepo.create({
      id: randomUUID(),
      name: dto.name,
      idea: dto.idea,
      status: 'CREATED',
      domain: domain,
    });
    return this.projectRepo.save(project);
  }

  async getById(id: string): Promise<Project> {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async delete(id: string): Promise<void> {
    // Transactional cascade delete across all linked data to prevent orphaned rows
    await this.dataSource.transaction(async (manager) => {
      const runs = await manager.find(WorkflowDagRun, {
        where: { projectId: id },
        select: ['id'],
      });
      const runIds = runs.map((r) => r.id);
      if (runIds.length > 0) {
        await manager
          .createQueryBuilder()
          .delete()
          .from(WorkflowDagNodeRun)
          .where('runId IN (:...runIds)', { runIds })
          .execute();
      }
      await manager.delete(WorkflowDagRun, { projectId: id });
      await manager.delete(GapAnalysisProposal, { projectId: id });
      await manager.delete(GapAnalysisActiveRun, { projectId: id });
      await manager.delete(GapAnalysisRun, { projectId: id });
      await manager.delete(DiscoveryCheckpoint, { projectId: id });
      await manager.delete(ModelUsage, { projectId: id });
      await manager.delete(RunLog, { projectId: id });
      await manager.delete(KnowledgeItem, { projectId: id });
      await manager.delete(WorkflowStep, { projectId: id });
      await manager.delete(AgentExecution, { projectId: id });
      await manager.delete(ClarificationQuestion, { projectId: id });
      await manager.delete(ValidationIssue, { projectId: id });
      await manager.delete(DocumentVersion, { projectId: id });
      await manager.delete(Document, { projectId: id });
      await manager.delete(ArtifactDependency, { projectId: id });
      await manager.delete(ArtifactVersion, { projectId: id });
      await manager.delete(Artifact, { projectId: id });
      await manager.delete(Project, { id });
    });
    this.logger.log(`Project ${id} and all linked data deleted via transaction`);
  }

  async start(id: string): Promise<Project> {
    const project = await this.getById(id);

    if (
      project.status === 'WAITING_FOR_USER' &&
      !(await this.discoveryCheckpoint.isConfirmed(id))
    ) {
      throw new BadRequestException('Discovery interpretation must be confirmed before continuing');
    }

    if (!RESTARTABLE_STATUSES.includes(project.status)) {
      throw new BadRequestException(`Cannot start project in status ${project.status}`);
    }

    const isFresh = project.status === 'CREATED';
    const isFullRerun =
      project.status === 'COMPLETED' || project.status === 'GAP_ANALYSIS_REVIEW';
    // WAITING_FOR_USER is already confirmed by confirmDiscovery() before start() runs;
    // the DAG's resumeProject auto-approves the discovery checkpoint + continues.
    // GAP_ANALYSIS_REVIEW starts a fresh run (DAG already completed; proposals abandoned).

    setImmediate(() => {
      try {
        if (isFresh || isFullRerun) {
          this.dagEngine.startProject(id).catch((err: unknown) => {
            this.logger.error(`DAG run crashed for project ${id}`, err);
          });
        } else {
          this.dagEngine.resumeProject(id).catch((err: unknown) => {
            this.logger.error(`DAG resume crashed for project ${id}`, err);
          });
        }
      } catch (err) {
        this.logger.error(`Failed to start project ${id}`, err);
      }
    });

    return this.getById(id);
  }

  async getDiscoveryConfirmation(id: string) {
    return this.discoveryCheckpoint.getByProject(id);
  }

  async confirmDiscovery(id: string, dto: ConfirmDiscoveryDto) {
    await this.discoveryCheckpoint.confirm(id, dto);
    return this.start(id);
  }

  async getRunLogs(id: string) {
    await this.getById(id);
    return this.runLog.listByProject(id);
  }

  async runGapAnalysis(id: string) {
    await this.getById(id);
    return this.gapAnalysis.startRun(id);
  }

  async getGapAnalysisHistory(id: string) {
    await this.getById(id);
    return this.gapAnalysis.getRunStatus(id);
  }

  async applyGapProposal(id: string, proposalId: string) {
    await this.getById(id);
    return this.gapAnalysis.applyProposal(id, proposalId);
  }

  async rejectGapProposal(id: string, proposalId: string) {
    await this.getById(id);
    return this.gapAnalysis.rejectProposal(id, proposalId);
  }

  async applyGapFinding(id: string, findingKey: string) {
    await this.getById(id);
    return this.gapAnalysis.applyFinding(id, findingKey);
  }

  async applyAllGapProposals(id: string) {
    await this.getById(id);
    return this.gapAnalysis.applyAllProposals(id);
  }

  async stopGapAnalysis(id: string) {
    await this.getById(id);
    return this.gapAnalysis.stopRun(id);
  }

  async recompile(id: string): Promise<Project> {
    await this.getById(id);
    await this.dagEngine.recompileDocument(id);
    return this.getById(id);
  }

  async cancel(id: string): Promise<Project> {
    await this.getById(id);
    try {
      await this.dagEngine.cancelProject(id);
    } catch {
      // fall through to direct cancellation if no active run exists
      await this.projectRepo.update(id, { status: 'CANCELLED', currentStage: null });
      this.events.emitProjectStatus(id, { status: 'CANCELLED', currentStage: null });
    }
    try {
      const snapshot = await this.dashboard.buildSnapshot(id);
      this.events.emitDashboardSnapshot(id, snapshot);
    } catch {
      /* ignore */
    }
    return this.getById(id);
  }

  async pause(id: string): Promise<Project> {
    const project = await this.getById(id);
    if (
      ![
        'DISCOVERING',
        'RESEARCHING',
        'ANALYSING',
        'GENERATING_REQUIREMENTS',
        'DESIGNING',
        'ARCHITECTING',
        'SECURITY_REVIEW',
        'QA_ANALYSIS',
        'ESTIMATING',
        'VALIDATING',
        'COMPILING',
      ].includes(project.status)
    ) {
      throw new BadRequestException('Project is not in a running state');
    }
    try {
      await this.dagEngine.pauseProject(id);
    } catch {
      // fall through to direct DB update if no active run exists
      await this.projectRepo.update(id, { status: 'PAUSED' });
      this.events.emitProjectStatus(id, { status: 'PAUSED', currentStage: project.currentStage });
    }
    try {
      const snapshot = await this.dashboard.buildSnapshot(id);
      this.events.emitDashboardSnapshot(id, snapshot);
    } catch {
      /* ignore */
    }
    return this.getById(id);
  }

  async regenerateFromAgent(id: string, agentKey: string): Promise<Project> {
    await this.getById(id);

    // Resolve the DAG node key: UI may send short keys (`frd`) or digest keys
    // (`frd-generation` / `build-prompt-generation`).
    let nodeKey = agentKey;
    if (agentKey.endsWith('-generation')) {
      const stripped = agentKey.replace(/-generation$/, '');
      if (stripped === 'build-prompt' || stripped === 'user-stories' || stripped === 'tech-arch' || stripped === 'db-design' || stripped === 'api-spec' || stripped === 'frd' || stripped === 'sow') {
        nodeKey = stripped === 'sow' ? 'sow' : stripped;
      }
    }
    const stage = AGENT_TO_STAGE[agentKey] ?? AGENT_TO_STAGE[nodeKey];
    if (stage) {
      const { DAG_NODE_TO_STAGE } = await import('../dag-engine/stage-mapping');
      const found = Object.entries(DAG_NODE_TO_STAGE).find(([, v]) => v === stage);
      if (found) nodeKey = found[0];
    } else {
      const { resolveStageForAgent } = await import('../dag-engine/pipeline.config');
      const resolved = resolveStageForAgent(agentKey);
      if (resolved) {
        const { DAG_NODE_TO_STAGE } = await import('../dag-engine/stage-mapping');
        const found = Object.entries(DAG_NODE_TO_STAGE).find(([, v]) => v === resolved);
        if (found) nodeKey = found[0];
      }
    }

    this.dagEngine.regenerateNode(id, nodeKey).catch((err: unknown) => {
      this.logger.error(`Regeneration crashed for project ${id}:`, err);
    });

    return this.getById(id);
  }

  async getDashboard(id: string) {
    return this.dashboard.buildSnapshot(id);
  }

  async getProgress(id: string) {
    const project = await this.getById(id);
    const steps = await this.stepRepo.find({
      where: { projectId: id },
      order: { createdAt: 'ASC' },
    });
    return { projectId: id, status: project.status, steps };
  }

  async getKnowledge(id: string): Promise<KnowledgeItem[]> {
    return this.knowledgeRepo.find({
      where: { projectId: id },
      order: { createdAt: 'ASC' },
    });
  }

  async getKnowledgeByAgent(id: string, agentKey: string): Promise<KnowledgeItem[]> {
    // Match items by createdBy or source (source stores "agentKey::category" or just "agentKey")
    return this.knowledgeRepo.find({
      where: [
        { projectId: id, createdBy: agentKey },
        { projectId: id, source: Like(`${agentKey}%`) },
      ],
      order: { createdAt: 'ASC' },
    });
  }

  async getRequirements(id: string): Promise<KnowledgeItem[]> {
    return this.knowledgeRepo.find({
      where: { projectId: id, type: 'FUNCTIONAL_REQUIREMENT' },
      order: { externalId: 'ASC' },
    });
  }

  async getAssumptions(id: string): Promise<KnowledgeItem[]> {
    return this.knowledgeRepo.find({
      where: { projectId: id, type: 'ASSUMPTION' },
      order: { createdAt: 'ASC' },
    });
  }

  async getQuestions(id: string): Promise<ClarificationQuestion[]> {
    return this.questionRepo.find({
      where: { projectId: id },
      order: { createdAt: 'ASC' },
    });
  }

  async answerQuestion(
    projectId: string,
    questionId: string,
    dto: AnswerQuestionDto,
  ): Promise<ClarificationQuestion> {
    const question = await this.questionRepo.findOne({
      where: { id: questionId, projectId },
    });
    if (!question) throw new NotFoundException('Question not found');

    await this.questionRepo.update(questionId, {
      answer: dto.answer,
      status: 'ANSWERED',
      answeredAt: new Date(),
    });

    const updated = await this.questionRepo.findOne({ where: { id: questionId } });
    if (!updated) throw new NotFoundException('Question not found');
    return updated;
  }

  async getExecutions(id: string): Promise<AgentExecution[]> {
    return this.executionRepo.find({
      where: { projectId: id },
      order: { createdAt: 'ASC' },
    });
  }

  async getValidation(id: string): Promise<ValidationIssue[]> {
    return this.issueRepo.find({
      where: { projectId: id },
      order: { severity: 'ASC' },
    });
  }

  async getDocument(id: string): Promise<Document> {
    const doc = await this.documentRepo.findOne({
      where: { projectId: id },
      order: { updatedAt: 'DESC' },
    });
    if (!doc) throw new NotFoundException('Document not yet generated');
    return doc;
  }

  async getDocumentsByType(id: string): Promise<Document[]> {
    return this.documentRepo.find({
      where: { projectId: id },
      order: { documentType: 'ASC', updatedAt: 'DESC' },
    });
  }

  async getDocumentByType(id: string, documentType: string): Promise<Document> {
    const doc = await this.documentRepo.findOne({ where: { projectId: id, documentType } });
    if (!doc) throw new NotFoundException(`Document of type '${documentType}' not found`);
    return doc;
  }

  async getStats(id: string) {
    await this.getById(id);

    const [
      knowledgeItems,
      openQuestionCount,
      executionCount,
      criticalIssueCount,
      validatedItemCount,
      validationIssueCount,
    ] = await Promise.all([
      this.knowledgeRepo.find({ where: { projectId: id }, select: ['type'] }),
      this.questionRepo.count({ where: { projectId: id, status: 'PENDING' } }),
      this.executionRepo.count({ where: { projectId: id } }),
      this.issueRepo.count({ where: { projectId: id, severity: 'CRITICAL' } }),
      this.knowledgeRepo.count({ where: { projectId: id, status: 'VALIDATED' } }),
      this.issueRepo.count({ where: { projectId: id } }),
    ]);

    const countByType: Record<string, number> = {};
    for (const item of knowledgeItems) {
      countByType[item.type] = (countByType[item.type] ?? 0) + 1;
    }

    return {
      projectId: id,
      knowledgeItemCount: knowledgeItems.length,
      requirementCount: countByType['FUNCTIONAL_REQUIREMENT'] ?? 0,
      assumptionCount: countByType['ASSUMPTION'] ?? 0,
      openQuestionCount,
      validationIssueCount,
      executionCount,
      criticalIssueCount,
      validatedItemCount,
    };
  }

  /** Feature 5: Edit a knowledge item directly */
  async updateKnowledgeItem(
    projectId: string,
    knowledgeId: string,
    body: { title?: string; description?: string; status?: string },
  ): Promise<KnowledgeItem> {
    const item = await this.knowledgeRepo.findOne({ where: { id: knowledgeId, projectId } });
    if (!item) throw new NotFoundException('Knowledge item not found');

    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.status !== undefined) updates.status = body.status;

    if (Object.keys(updates).length > 0) {
      updates.version = () => 'version + 1';
      await this.knowledgeRepo.update(knowledgeId, updates as any);
    }

    const updated = await this.knowledgeRepo.findOne({ where: { id: knowledgeId } });
    if (!updated) throw new NotFoundException('Knowledge item not found');
    return updated;
  }

  /** Feature 5: Regenerate affected sections after an edit */
  async regenerateAffected(projectId: string, knowledgeId: string): Promise<{ message: string }> {
    const item = await this.knowledgeRepo.findOne({ where: { id: knowledgeId, projectId } });
    if (!item) throw new NotFoundException('Knowledge item not found');

    this.logger.log('Regenerating affected sections for knowledge item ' + knowledgeId);

    // Recompile the document to reflect changes
    setImmediate(() => {
      this.dagEngine.recompileDocument(projectId).catch((err: unknown) => {
        this.logger.error('Recompilation failed after edit: ' + String(err));
      });
    });

    return { message: 'Regeneration started. The document will be updated shortly.' };
  }

  /** Feature 6: List document versions */
  async getDocumentVersions(projectId: string) {
    return this.docVersionRepo.find({
      where: { projectId },
      order: { version: 'DESC' },
    });
  }

  /** Feature 6: Get a specific document version */
  async getDocumentVersion(projectId: string, version: number, documentType?: string) {
    const v = await this.docVersionRepo.findOne({
      where: documentType ? { projectId, version, documentType } : { projectId, version },
    });
    if (!v) throw new NotFoundException('Version not found');
    return v;
  }

  /** Refine the project idea through LLM for better processing */
  async refineIdea(id: string): Promise<Project> {
    const project = await this.getById(id);
    const rawIdea = project.idea;

    this.logger.log('Refining idea for project ' + id);

    // First, try to parse JSON and extract readable content
    let inputText = rawIdea;
    const trimmed = rawIdea.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const obj = JSON.parse(trimmed);
        const parts: string[] = [];
        for (const [key, value] of Object.entries(obj)) {
          if (value === null || value === undefined) continue;
          const label = key
            .replace(/([A-Z])/g, ' $1')
            .replace(/[_-]/g, ' ')
            .trim();
          if (typeof value === 'string' && value.length > 5) {
            parts.push(label + ': ' + value);
          } else if (Array.isArray(value)) {
            const items = value
              .filter(Boolean)
              .map((v) => (typeof v === 'string' ? v : JSON.stringify(v)));
            if (items.length > 0) {
              parts.push(label + ':\n' + items.map((item) => '- ' + item).join('\n'));
            }
          } else if (typeof value === 'object') {
            const subParts: string[] = [];
            for (const [subKey, subVal] of Object.entries(value)) {
              if (subVal !== null && subVal !== undefined) {
                subParts.push(subKey.replace(/([A-Z])/g, ' $1') + ': ' + String(subVal));
              }
            }
            if (subParts.length > 0) parts.push(label + ':\n' + subParts.join('\n'));
          }
        }
        if (parts.length > 0) {
          inputText = parts.join('\n\n');
        }
      } catch {
        // Not valid JSON, use raw text
      }
    }

    try {
      const prompt =
        'Project: ' +
        project.name +
        '\n\nCurrent project description:\n' +
        inputText.slice(0, 3000) +
        '\n\nRestructure this into a clean, well-organized natural language project description. Use clear headings and paragraphs. Include: project purpose, target users, core features, technical considerations. Do NOT use JSON format, code blocks, or markdown headers. Write in professional prose.';

      const r = await this.llm.generateText([
        {
          role: 'system',
          content:
            'You are a professional requirements analyst. Restructure project descriptions into clean, readable natural language with clear sections. Never output JSON, code blocks, or markdown formatting.',
        },
        { role: 'user', content: prompt },
      ]);

      const refined = r.content.trim();
      // Remove any code block wrappers if present
      const cleanRefined = refined
        .replace(/^```[a-z]*\n/, '')
        .replace(/\n```$/, '')
        .trim();

      if (cleanRefined.length > 20) {
        await this.projectRepo.update(id, { idea: cleanRefined });
        this.logger.log('Idea refined for project ' + id);
        return this.getById(id);
      }
    } catch (err: unknown) {
      this.logger.warn(
        'Failed to refine idea: ' + (err instanceof Error ? err.message : String(err)),
      );
    }

    return project;
  }
}
