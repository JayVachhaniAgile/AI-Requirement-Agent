import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
} from '../database/entities';
import { WorkflowService } from '../workflow/workflow.service';
import { DashboardService } from '../realtime/dashboard.service';
import { WorkflowEventsService } from '../realtime/workflow-events.service';
import { DomainService } from '../agents/domain.service';
import { LlmService } from '../llm/llm.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { AnswerQuestionDto } from './dto/answer-question.dto';

const RESTARTABLE_STATUSES = ['CREATED', 'FAILED', 'WAITING_FOR_USER'];

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectRepository(Project) private readonly projectRepo: Repository<Project>,
    @InjectRepository(KnowledgeItem) private readonly knowledgeRepo: Repository<KnowledgeItem>,
    @InjectRepository(WorkflowStep) private readonly stepRepo: Repository<WorkflowStep>,
    @InjectRepository(AgentExecution) private readonly executionRepo: Repository<AgentExecution>,
    @InjectRepository(ClarificationQuestion) private readonly questionRepo: Repository<ClarificationQuestion>,
    @InjectRepository(ValidationIssue) private readonly issueRepo: Repository<ValidationIssue>,
    @InjectRepository(Document) private readonly documentRepo: Repository<Document>,
    @InjectRepository(DocumentVersion) private readonly docVersionRepo: Repository<DocumentVersion>,
    private readonly workflow: WorkflowService,
    private readonly dashboard: DashboardService,
    private readonly events: WorkflowEventsService,
    private readonly domainService: DomainService,
    private readonly llm: LlmService,
  ) {}

  async list(): Promise<Project[]> {
    return this.projectRepo.find({ order: { createdAt: 'DESC' } });
  }

  async create(dto: CreateProjectDto): Promise<Project> {
    let domain = dto.domain;
    if (!domain) {
      const domainInfo = await this.domainService.detectDomain(dto.idea, dto.name);
      domain = domainInfo.domain;
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
    // Cascade delete all linked data
    await this.knowledgeRepo.delete({ projectId: id });
    await this.stepRepo.delete({ projectId: id });
    await this.executionRepo.delete({ projectId: id });
    await this.questionRepo.delete({ projectId: id });
    await this.issueRepo.delete({ projectId: id });
    await this.docVersionRepo.delete({ projectId: id });
    await this.documentRepo.delete({ projectId: id });
    await this.projectRepo.delete({ id });
    this.logger.log(`Project ${id} and all linked data deleted`);
  }

  async start(id: string): Promise<Project> {
    const project = await this.getById(id);

    if (!RESTARTABLE_STATUSES.includes(project.status)) {
      throw new BadRequestException(`Cannot start project in status ${project.status}`);
    }

    let resumeStage: string;
    let projectStatus: string;
    const isFresh = project.status === 'CREATED';

    if (isFresh) {
      await this.workflow.createWorkflowSteps(id);
      resumeStage = 'DISCOVERY';
      projectStatus = 'DISCOVERING';
      this.logger.log(`Starting fresh workflow for project ${id}`);
    } else {
      const resume = await this.workflow.prepareResume(id);
      resumeStage = resume.resumeStage;
      projectStatus = resume.projectStatus;
      this.logger.log(`Resuming workflow for project ${id} from ${resumeStage}`);
    }

    await this.projectRepo.update(id, {
      status: projectStatus,
      currentStage: resumeStage,
      errorMessage: null,
    });

    this.events.emitProjectStatus(id, {
      status: projectStatus,
      currentStage: resumeStage,
      errorMessage: null,
    });

    setImmediate(() => {
      this.workflow.runWorkflow(id).catch((err: unknown) => {
        this.logger.error(`Workflow crashed unexpectedly for project ${id}`, err);
      });
    });

    return this.getById(id);
  }

  async recompile(id: string): Promise<Project> {
    await this.getById(id);
    await this.workflow.recompileDocument(id);
    return this.getById(id);
  }

  async cancel(id: string): Promise<Project> {
    await this.getById(id);
    await this.projectRepo.update(id, { status: 'CANCELLED', currentStage: null });
    this.events.emitProjectStatus(id, { status: 'CANCELLED', currentStage: null });
    try {
      const snapshot = await this.dashboard.buildSnapshot(id);
      this.events.emitDashboardSnapshot(id, snapshot);
    } catch {
      /* ignore */
    }
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
    const doc = await this.documentRepo.findOne({ where: { projectId: id } });
    if (!doc) throw new NotFoundException('Document not yet generated');
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
      this.workflow.recompileDocument(projectId).catch((err: unknown) => {
        this.logger.error('Recompilation failed after edit: ' + String(err));
      });
    });

    return { message: 'Regeneration started. The document will be updated shortly.' };
  }


  /** Feature 6: List document versions */
  async getDocumentVersions(projectId: string) {
    return this.docVersionRepo.find({
      where: { projectId },
      order: { version: "DESC" },
    });
  }

  /** Feature 6: Get a specific document version */
  async getDocumentVersion(projectId: string, version: number) {
    const v = await this.docVersionRepo.findOne({ where: { projectId, version } });
    if (!v) throw new NotFoundException("Version not found");
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
          const label = key.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').trim();
          if (typeof value === 'string' && value.length > 5) {
            parts.push(label + ': ' + value);
          } else if (Array.isArray(value)) {
            const items = value.filter(Boolean).map((v) => typeof v === 'string' ? v : JSON.stringify(v));
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
      const prompt = 'Project: ' + project.name + '\n\nCurrent project description:\n' + inputText.slice(0, 3000) + '\n\nRestructure this into a clean, well-organized natural language project description. Use clear headings and paragraphs. Include: project purpose, target users, core features, technical considerations. Do NOT use JSON format, code blocks, or markdown headers. Write in professional prose.';

      const r = await this.llm.generateText([
        {
          role: 'system',
          content: 'You are a professional requirements analyst. Restructure project descriptions into clean, readable natural language with clear sections. Never output JSON, code blocks, or markdown formatting.',
        },
        { role: 'user', content: prompt },
      ]);

      const refined = r.content.trim();
      // Remove any code block wrappers if present
      const cleanRefined = refined.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '').trim();

      if (cleanRefined.length > 20) {
        await this.projectRepo.update(id, { idea: cleanRefined });
        this.logger.log('Idea refined for project ' + id);
        return this.getById(id);
      }
    } catch (err: unknown) {
      this.logger.warn('Failed to refine idea: ' + (err instanceof Error ? err.message : String(err)));
    }

    return project;
  }

}
