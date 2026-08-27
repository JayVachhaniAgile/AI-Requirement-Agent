import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Project,
  WorkflowStep,
  AgentExecution,
  KnowledgeItem,
  ClarificationQuestion,
  ValidationIssue,
  Document,
} from '../database/entities';
import {
  AGENT_DISPLAY_NAMES,
  DEFAULT_STAGE_SECONDS,
  STAGE_TO_AGENT,
} from './agent-phases';
import { PIPELINE_STAGES } from '../dag-engine/pipeline.config';

const TOTAL_STAGES = PIPELINE_STAGES.length;

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Project) private readonly projectRepo: Repository<Project>,
    @InjectRepository(WorkflowStep) private readonly stepRepo: Repository<WorkflowStep>,
    @InjectRepository(AgentExecution) private readonly executionRepo: Repository<AgentExecution>,
    @InjectRepository(KnowledgeItem) private readonly knowledgeRepo: Repository<KnowledgeItem>,
    @InjectRepository(ClarificationQuestion) private readonly questionRepo: Repository<ClarificationQuestion>,
    @InjectRepository(ValidationIssue) private readonly issueRepo: Repository<ValidationIssue>,
    @InjectRepository(Document) private readonly documentRepo: Repository<Document>,
  ) {}

  async buildSnapshot(projectId: string) {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');

    const [steps, executions, knowledge, openQuestions, criticalIssues, document] =
      await Promise.all([
        this.stepRepo.find({ where: { projectId }, order: { createdAt: 'ASC' } }),
        this.executionRepo.find({ where: { projectId }, order: { createdAt: 'ASC' } }),
        this.knowledgeRepo.find({ where: { projectId }, order: { createdAt: 'ASC' } }),
        this.questionRepo.count({ where: { projectId, status: 'PENDING' } }),
        this.issueRepo.count({ where: { projectId, severity: 'CRITICAL' } }),
        this.documentRepo.findOne({ where: { projectId } }),
      ]);

    const completedSteps = steps.filter((s) => s.status === 'COMPLETED');
    const completedAgents = completedSteps.length;
    // Use the project's actual step count when completed so that projects
    // created before newer pipeline stages were added still show 100%.
    const totalAgents =
      project.status === 'COMPLETED' ? Math.max(steps.length, TOTAL_STAGES) : TOTAL_STAGES;
    const percentComplete = Math.round((completedAgents / totalAgents) * 100);

    const currentStage = project.currentStage;
    const currentAgentKey = currentStage ? (STAGE_TO_AGENT[currentStage] ?? null) : null;
    const currentStepLabel = currentAgentKey
      ? (AGENT_DISPLAY_NAMES[currentAgentKey] ?? currentStage)
      : project.status === 'COMPLETED'
        ? 'Complete'
        : 'Not started';

    const etaSeconds = this.estimateEta(steps);
    const { requirementCompleteness, aiConfidence } = this.deriveScores(
      knowledge,
      document,
      completedAgents,
      totalAgents,
    );

    const inputTokens = executions.reduce((s, e) => s + (e.inputTokens ?? 0), 0);
    const outputTokens = executions.reduce((s, e) => s + (e.outputTokens ?? 0), 0);

    const frCount = knowledge.filter((k) => k.type === 'FUNCTIONAL_REQUIREMENT').length;
    const docStats = this.summarizeMarkdown(document?.markdownContent ?? null);

    const runningStep = steps.find((s) => s.status === 'RUNNING');
    let currentStepProgress = 0;
    if (runningStep?.startedAt) {
      const elapsed = (Date.now() - new Date(runningStep.startedAt).getTime()) / 1000;
      const expected = DEFAULT_STAGE_SECONDS[runningStep.stage] ?? 100;
      currentStepProgress = Math.min(95, Math.round((elapsed / expected) * 100));
    } else if (project.status === 'COMPLETED') {
      currentStepProgress = 100;
    }

    return {
      projectId,
      status: project.status,
      currentStage,
      currentAgentKey,
      currentStep: currentStepLabel,
      currentStepProgress,
      percentComplete,
      completedAgents,
      totalAgents,
      etaSeconds,
      requirementCompleteness,
      aiConfidence,
      openQuestionCount: openQuestions,
      criticalIssueCount: criticalIssues,
      tokenTotals: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      documentStats: docStats,
      requirementCount: frCount,
      knowledgeItemCount: knowledge.length,
      hasDocument: Boolean(document?.markdownContent),
      steps: steps.map((s) => {
        let progress = 0;
        if (s.status === 'COMPLETED') {
          progress = 100;
        } else if (s.status === 'RUNNING' && s.startedAt) {
          const elapsed = (Date.now() - new Date(s.startedAt).getTime()) / 1000;
          const expected = DEFAULT_STAGE_SECONDS[s.stage] ?? 100;
          progress = Math.min(95, Math.round((elapsed / expected) * 100));
        }
        return {
          id: s.id,
          stage: s.stage,
          status: s.status,
          progress,
          startedAt: s.startedAt?.toISOString() ?? null,
          completedAt: s.completedAt?.toISOString() ?? null,
          error: s.error,
          durationMs: this.durationMs(s),
          estimatedSeconds: DEFAULT_STAGE_SECONDS[s.stage] ?? 100,
          agentKey: STAGE_TO_AGENT[s.stage] ?? s.stage.toLowerCase(),
          label: AGENT_DISPLAY_NAMES[STAGE_TO_AGENT[s.stage] ?? ''] ?? s.stage,
        };
      }),
      recentExecutions: executions.slice(-8).map((e) => ({
        id: e.id,
        agentKey: e.agentKey,
        status: e.status,
        model: e.model,
        inputTokens: e.inputTokens,
        outputTokens: e.outputTokens,
        error: e.error,
        startedAt: e.startedAt?.toISOString() ?? null,
        completedAt: e.completedAt?.toISOString() ?? null,
      })),
      idea: project.idea,
      projectName: project.name,
      updatedAt: project.updatedAt?.toISOString() ?? new Date().toISOString(),
    };
  }

  private durationMs(step: WorkflowStep): number | null {
    if (!step.startedAt || !step.completedAt) return null;
    return new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime();
  }

  private estimateEta(steps: WorkflowStep[]): number {
    const completedDurations = steps
      .filter((s) => s.status === 'COMPLETED' && s.startedAt && s.completedAt)
      .map((s) => this.durationMs(s)!)
      .filter((ms) => ms > 0);

    const avgMs =
      completedDurations.length > 0
        ? completedDurations.reduce((a, b) => a + b, 0) / completedDurations.length
        : null;

    let remaining = 0;
    for (const step of steps) {
      if (step.status === 'COMPLETED') continue;
      if (step.status === 'RUNNING' && step.startedAt) {
        const expectedMs = (avgMs ?? (DEFAULT_STAGE_SECONDS[step.stage] ?? 100) * 1000);
        const elapsed = Date.now() - new Date(step.startedAt).getTime();
        remaining += Math.max(expectedMs * 0.2, expectedMs - elapsed);
      } else {
        remaining += avgMs ?? (DEFAULT_STAGE_SECONDS[step.stage] ?? 100) * 1000;
      }
    }
    return Math.max(0, Math.round(remaining / 1000));
  }

  private deriveScores(
    knowledge: KnowledgeItem[],
    document: Document | null,
    completedAgents: number,
    totalAgents: number,
  ): { requirementCompleteness: number; aiConfidence: number } {
    const scoresItem = [...knowledge]
      .reverse()
      .find((k) => k.type === 'VALIDATION_SCORES' || k.type === 'CRITIC_SCORE');

    let requirementCompleteness: number | null = null;
    let aiConfidence: number | null = null;

    if (scoresItem?.description) {
      // Extract all score values like "fieldName: 7/10" or "fieldName: 7"
      const allScores = [...scoresItem.description.matchAll(/(\d+(?:\.\d+)?)\s*\/\s*\d+/g)];
      const allValues = allScores.map((m) => Number(m[1])).filter((v) => v >= 0 && v <= 10);

      const completenessMatch = scoresItem.description.match(
        /completeness[^0-9]*(\d+(?:\.\d+)?)/i,
      );
      const confidenceMatch = scoresItem.description.match(
        /confidence[^0-9]*(\d+(?:\.\d+)?)/i,
      );

      if (completenessMatch) {
        const v = Number(completenessMatch[1]);
        requirementCompleteness = v <= 10 ? Math.round(v * 10) : Math.round(v);
      }

      if (confidenceMatch) {
        const v = Number(confidenceMatch[1]);
        aiConfidence = v <= 10 ? Math.round(v * 10) : Math.round(v);
      }

      // If no explicit confidence field, compute average from all scores
      if (aiConfidence === null && allValues.length > 0) {
        const avg = allValues.reduce((a, b) => a + b, 0) / allValues.length;
        aiConfidence = Math.round(avg * 10);
      }
    }

    if (document?.validationScore) {
      const parsed = Number(document.validationScore);
      if (!Number.isNaN(parsed)) {
        aiConfidence = parsed <= 10 ? Math.round(parsed * 10) : Math.round(parsed);
      }
    }

    const frCount = knowledge.filter((k) => k.type === 'FUNCTIONAL_REQUIREMENT').length;
    const validated = knowledge.filter((k) => k.status === 'VALIDATED').length;

    if (requirementCompleteness === null) {
      const base = Math.min(95, Math.round((completedAgents / Math.max(1, totalAgents)) * 70 + Math.min(frCount, 20)));
      const bonus = validated > 0 ? Math.min(10, validated) : 0;
      requirementCompleteness = Math.min(98, base + bonus);
    }

    if (aiConfidence === null) {
      aiConfidence = Math.min(
        97,
        Math.round(55 + (completedAgents / Math.max(1, totalAgents)) * 35 + Math.min(frCount, 10)),
      );
    }

    return { requirementCompleteness, aiConfidence };
  }

  private summarizeMarkdown(md: string | null) {
    if (!md) {
      return { sections: 0, pages: 0, diagrams: 0, tables: 0, wordCount: 0 };
    }
    const sections = (md.match(/^#{1,3}\s+/gm) ?? []).length;
    const tables = (md.match(/^\|.*\|$/gm) ?? []).length > 0
      ? Math.max(1, Math.round((md.match(/^\|[^\n]+\|$/gm) ?? []).length / 4))
      : 0;
    const diagrams =
      (md.match(/```(?:mermaid|plantuml)/gi) ?? []).length +
      (md.match(/!\[.*\]\(/g) ?? []).length;
    const wordCount = md.split(/\s+/).filter(Boolean).length;
    const pages = Math.max(1, Math.round(wordCount / 350));
    return { sections, pages, diagrams, tables, wordCount };
  }
}
