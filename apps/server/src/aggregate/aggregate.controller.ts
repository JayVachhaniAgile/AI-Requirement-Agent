import { Controller, Get, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Project,
  KnowledgeItem,
  WorkflowStep,
  AgentExecution,
  ClarificationQuestion,
  ValidationIssue,
  Document,
} from '../database/entities';
import { RunLogService } from '../run-log/run-log.service';
import { PIPELINE_STAGES } from '../dag-engine/pipeline.config';

@Controller('aggregate')
export class AggregateController {
  constructor(
    @InjectRepository(Project) private readonly projectRepo: Repository<Project>,
    @InjectRepository(KnowledgeItem) private readonly knowledgeRepo: Repository<KnowledgeItem>,
    @InjectRepository(WorkflowStep) private readonly stepRepo: Repository<WorkflowStep>,
    @InjectRepository(AgentExecution) private readonly executionRepo: Repository<AgentExecution>,
    @InjectRepository(ClarificationQuestion)
    private readonly questionRepo: Repository<ClarificationQuestion>,
    @InjectRepository(ValidationIssue) private readonly issueRepo: Repository<ValidationIssue>,
    @InjectRepository(Document) private readonly documentRepo: Repository<Document>,
    private readonly runLog: RunLogService,
  ) {}

  @Get('run-log-patterns')
  async getRunLogPatterns(@Query('days') days?: string) {
    const parsed = days ? Number(days) : undefined;
    return this.runLog.getPatternSummary(parsed && Number.isFinite(parsed) ? parsed : undefined);
  }

  @Get('requirements')
  async getAllRequirements() {
    const items = await this.knowledgeRepo.find({
      where: { type: 'FUNCTIONAL_REQUIREMENT' },
      order: { createdAt: 'DESC' },
    });
    const projects = await this.projectRepo.find();
    const projectMap = new Map(projects.map((p) => [p.id, p.name]));
    return items.map((item) => ({
      ...item,
      projectName: projectMap.get(item.projectId) ?? 'Unknown',
    }));
  }

  @Get('validation')
  async getAllValidation() {
    const issues = await this.issueRepo.find({ order: { createdAt: 'DESC' } });
    const projects = await this.projectRepo.find();
    const projectMap = new Map(projects.map((p) => [p.id, p.name]));
    return issues.map((issue) => ({
      ...issue,
      projectName: projectMap.get(issue.projectId) ?? 'Unknown',
    }));
  }

  @Get('documents')
  async getAllDocuments() {
    const docs = await this.documentRepo.find({ order: { updatedAt: 'DESC' } });
    const projects = await this.projectRepo.find();
    const projectMap = new Map(projects.map((p) => [p.id, p.name]));
    return docs
      .filter((d) => d.markdownContent)
      .map((doc) => {
        const md = doc.markdownContent ?? '';
        const wordCount = md.split(/\s+/).filter(Boolean).length;
        const sections = (md.match(/^#{1,3}\s+/gm) ?? []).length;
        const tables = Math.max(0, Math.round((md.match(/^\|[^\n]+\|$/gm) ?? []).length / 4));
        const diagrams = (md.match(/```(?:mermaid|plantuml)/gi) ?? []).length;
        const pages = Math.max(1, Math.round(wordCount / 350));
        const confidence = doc.validationScore ? Number(doc.validationScore) : null;
        return {
          id: doc.id,
          projectId: doc.projectId,
          projectName: projectMap.get(doc.projectId) ?? 'Unknown',
          status: doc.status,
          validationScore: doc.validationScore,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
          stats: { sections, pages, diagrams, tables, wordCount },
          confidence:
            confidence && !Number.isNaN(confidence)
              ? confidence <= 10
                ? Math.round(confidence * 10)
                : Math.round(confidence)
              : null,
        };
      });
  }

  @Get('analytics')
  async getAnalytics() {
    const projects = await this.projectRepo.find();
    const executions = await this.executionRepo.find({ order: { createdAt: 'ASC' } });
    const allKnowledge = await this.knowledgeRepo.find();
    const allIssues = await this.issueRepo.find();
    const allSteps = await this.stepRepo.find({ order: { createdAt: 'ASC' } });

    const totalInputTokens = executions.reduce((s, e) => s + (e.inputTokens ?? 0), 0);
    const totalOutputTokens = executions.reduce((s, e) => s + (e.outputTokens ?? 0), 0);

    const completedProjects = projects.filter((p) => p.status === 'COMPLETED').length;
    const runningProjects = projects.filter(
      (p) => !['COMPLETED', 'CREATED', 'CANCELLED', 'FAILED'].includes(p.status),
    ).length;
    const failedProjects = projects.filter((p) => p.status === 'FAILED').length;

    const totalRequirements = allKnowledge.filter(
      (k) => k.type === 'FUNCTIONAL_REQUIREMENT',
    ).length;
    const validatedRequirements = allKnowledge.filter(
      (k) => k.type === 'FUNCTIONAL_REQUIREMENT' && k.status === 'VALIDATED',
    ).length;
    const criticalIssues = allIssues.filter((i) => i.severity === 'CRITICAL').length;
    const openIssues = allIssues.filter((i) => i.status === 'OPEN').length;

    const agentExecutions: Record<
      string,
      { count: number; totalDuration: number; successes: number; failures: number }
    > = {};
    for (const e of executions) {
      const key = e.agentKey ?? 'unknown';
      if (!agentExecutions[key])
        agentExecutions[key] = { count: 0, totalDuration: 0, successes: 0, failures: 0 };
      agentExecutions[key].count++;
      if (e.startedAt && e.completedAt) {
        agentExecutions[key].totalDuration +=
          new Date(e.completedAt).getTime() - new Date(e.startedAt).getTime();
      }
      if (e.status === 'COMPLETED') agentExecutions[key].successes++;
      if (e.status === 'FAILED') agentExecutions[key].failures++;
    }

    const agentStats = Object.entries(agentExecutions).map(([key, val]) => ({
      agentKey: key,
      executions: val.count,
      avgDurationMs: val.count > 0 ? Math.round(val.totalDuration / val.count) : 0,
      successRate: val.count > 0 ? Math.round((val.successes / val.count) * 100) : 0,
      failures: val.failures,
    }));

    const pipelineStats = allSteps.reduce(
      (acc, step) => {
        if (!acc[step.stage]) acc[step.stage] = { completed: 0, failed: 0, running: 0, total: 0 };
        acc[step.stage].total++;
        if (step.status === 'COMPLETED') acc[step.stage].completed++;
        if (step.status === 'FAILED') acc[step.stage].failed++;
        if (step.status === 'RUNNING') acc[step.stage].running++;
        return acc;
      },
      {} as Record<string, { completed: number; failed: number; running: number; total: number }>,
    );

    return {
      totalProjects: projects.length,
      completedProjects,
      runningProjects,
      failedProjects,
      totalExecutions: executions.length,
      tokenTotals: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
      },
      totalRequirements,
      validatedRequirements,
      totalIssues: allIssues.length,
      criticalIssues,
      openIssues,
      agentStats,
      pipelineStats,
    };
  }

  @Get('workflow')
  async getWorkflowOverview() {
    const projects = await this.projectRepo.find({ order: { createdAt: 'DESC' } });
    const steps = await this.stepRepo.find({ order: { createdAt: 'ASC' } });
    const executions = await this.executionRepo.find({ order: { createdAt: 'ASC' } });

    const stepsByProject = new Map<string, typeof steps>();
    for (const s of steps) {
      const arr = stepsByProject.get(s.projectId) ?? [];
      arr.push(s);
      stepsByProject.set(s.projectId, arr);
    }

    const projectSummaries = projects.map((p) => {
      const projSteps = stepsByProject.get(p.id) ?? [];
      const completed = projSteps.filter((s) => s.status === 'COMPLETED').length;
      const total = PIPELINE_STAGES.length;
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        currentStage: p.currentStage,
        completedSteps: completed,
        totalSteps: total,
        percentComplete: Math.round((completed / total) * 100),
        lastActivity:
          projSteps.length > 0
            ? (projSteps[projSteps.length - 1].completedAt ??
              projSteps[projSteps.length - 1].createdAt)
            : p.createdAt,
      };
    });

    const agentRunHistory = executions
      .slice(-50)
      .reverse()
      .map((e) => ({
        id: e.id,
        projectId: e.projectId,
        agentKey: e.agentKey,
        status: e.status,
        model: e.model,
        inputTokens: e.inputTokens,
        outputTokens: e.outputTokens,
        startedAt: e.startedAt,
        completedAt: e.completedAt,
      }));

    return { projectSummaries, agentRunHistory };
  }
}
