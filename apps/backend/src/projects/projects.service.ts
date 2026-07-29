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
} from '../database/entities';
import { WorkflowService } from '../workflow/workflow.service';
import { DashboardService } from '../realtime/dashboard.service';
import { WorkflowEventsService } from '../realtime/workflow-events.service';
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
    private readonly workflow: WorkflowService,
    private readonly dashboard: DashboardService,
    private readonly events: WorkflowEventsService,
  ) {}

  async list(): Promise<Project[]> {
    return this.projectRepo.find({ order: { createdAt: 'DESC' } });
  }

  async create(dto: CreateProjectDto): Promise<Project> {
    const project = this.projectRepo.create({
      id: randomUUID(),
      name: dto.name,
      idea: dto.idea,
      status: 'CREATED',
    });
    return this.projectRepo.save(project);
  }

  async getById(id: string): Promise<Project> {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async delete(id: string): Promise<void> {
    await this.projectRepo.delete({ id });
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
}
