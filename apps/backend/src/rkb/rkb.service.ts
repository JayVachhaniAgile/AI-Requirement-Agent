import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  KnowledgeItem,
  ClarificationQuestion,
  ValidationIssue,
  Document,
  DocumentVersion,
  AgentExecution,
} from '../database/entities';
import type { NewKnowledgeItem, NewQuestion, NewValidationIssue, AgentTokens } from '../agents/types';

@Injectable()
export class RkbService {
  private readonly logger = new Logger(RkbService.name);

  constructor(
    @InjectRepository(KnowledgeItem) private readonly kiRepo: Repository<KnowledgeItem>,
    @InjectRepository(ClarificationQuestion) private readonly cqRepo: Repository<ClarificationQuestion>,
    @InjectRepository(ValidationIssue) private readonly viRepo: Repository<ValidationIssue>,
    @InjectRepository(Document) private readonly docRepo: Repository<Document>,
    @InjectRepository(DocumentVersion) private readonly dvRepo: Repository<DocumentVersion>,
    @InjectRepository(AgentExecution) private readonly execRepo: Repository<AgentExecution>,
  ) {}

  async saveKnowledgeItems(projectId: string, items: NewKnowledgeItem[], agentKey: string): Promise<void> {
    if (items.length === 0) return;
    await this.kiRepo.save(items.map((item) => {
      const metadataObj: Record<string, unknown> = {};
      if (item.sourceCategory) metadataObj.sourceCategory = item.sourceCategory;
      if (item.evidence) metadataObj.evidence = item.evidence;
      if (item.reasoning) metadataObj.reasoning = item.reasoning;
      if (item.confidence !== undefined) metadataObj.confidence = item.confidence;
      return this.kiRepo.create({
        id: randomUUID(), projectId, externalId: item.externalId ?? null, type: item.type,
        title: item.title, description: item.description ?? null, status: item.status,
        source: item.sourceCategory ? `${agentKey}::${item.sourceCategory}` : agentKey,
        createdBy: agentKey,
        metadata: Object.keys(metadataObj).length > 0 ? JSON.stringify(metadataObj) : null,
        version: 1, relatedIds: item.relatedIds ?? [],
      });
    }));
  }

  async saveQuestions(projectId: string, questions: NewQuestion[]): Promise<void> {
    if (questions.length === 0) return;
    await this.cqRepo.save(questions.map((q) => this.cqRepo.create({
      id: randomUUID(), projectId, question: q.question, context: q.context ?? null,
      isBlocking: q.isBlocking, status: 'PENDING',
    })));
  }

  async saveValidationIssues(projectId: string, issues: NewValidationIssue[], agentKey: string): Promise<void> {
    if (issues.length === 0) return;
    await this.viRepo.save(issues.map((issue) => this.viRepo.create({
      id: randomUUID(), projectId, externalId: issue.externalId ?? null, severity: issue.severity,
      category: issue.category, sourceAgent: issue.sourceAgent ?? agentKey, affectedIds: issue.affectedIds ?? [],
      problem: issue.problem, evidence: issue.evidence ?? null, impact: issue.impact ?? null,
      recommendedCorrection: issue.recommendedCorrection ?? null, responsibleAgent: issue.responsibleAgent ?? null,
      requiresHumanDecision: issue.requiresHumanDecision ?? false, status: 'OPEN',
    })));
  }

  /** Save a document version snapshot, then update the current document. */
  async saveDocument(
    projectId: string,
    markdownContent: string,
    changeSummary?: string,
    triggerEvent?: string,
  ): Promise<void> {
    // Determine next version number
    const latestVersion = await this.dvRepo.findOne({
      where: { projectId },
      order: { version: 'DESC' },
    });
    const nextVersion = (latestVersion?.version ?? 0) + 1;

    // Find affected knowledge items for impact tracking
    const knowledgeItems = await this.kiRepo.find({ where: { projectId } });
    const affectedItemIds = knowledgeItems
      .filter((k) => {
        // Items mentioned in the new content
        if (k.externalId && markdownContent.includes(k.externalId)) return true;
        if (k.title && markdownContent.includes(k.title)) return true;
        return false;
      })
      .map((k) => k.id);

    // Save version snapshot
    await this.dvRepo.save(this.dvRepo.create({
      id: randomUUID(),
      projectId,
      version: nextVersion,
      markdownContent,
      changeSummary: changeSummary ?? null,
      affectedItemIds,
      triggerEvent: triggerEvent ?? null,
    }));

    // Update or create current document
    const existing = await this.docRepo.findOne({ where: { projectId } });
    if (existing) {
      await this.docRepo.update(existing.id, {
        markdownContent,
        status: 'FINAL',
        validationScore: String(nextVersion),
      });
    } else {
      await this.docRepo.save(this.docRepo.create({
        id: randomUUID(), projectId, status: 'FINAL', markdownContent,
        validationScore: String(nextVersion),
      }));
    }

    this.logger.log(`Document v${nextVersion} saved for project ${projectId} (${affectedItemIds.length} items affected)`);
  }

  /** Get all document versions for a project */
  async getDocumentVersions(projectId: string): Promise<DocumentVersion[]> {
    return this.dvRepo.find({
      where: { projectId },
      order: { version: 'DESC' },
    });
  }

  /** Get a specific version */
  async getDocumentVersion(projectId: string, version: number): Promise<DocumentVersion | null> {
    return this.dvRepo.findOne({ where: { projectId, version } });
  }

  async getKnowledgeContext(projectId: string): Promise<Array<{
    externalId: string | null; type: string; title: string; description: string | null;
    status: string; sourceCategory?: string;
  }>> {
    const items = await this.kiRepo.find({
      where: { projectId },
      select: ['externalId', 'type', 'title', 'description', 'status', 'metadata'],
    });
    return items.map((item) => {
      const meta = item.metadata ? JSON.parse(item.metadata) : {};
      return {
        externalId: item.externalId, type: item.type, title: item.title,
        description: item.description, status: item.status,
        sourceCategory: meta.sourceCategory ?? undefined,
      };
    });
  }

  async getAnsweredQuestions(projectId: string): Promise<Array<{ question: string; answer: string }>> {
    const rows = await this.cqRepo.find({
      where: { projectId, status: 'ANSWERED' }, select: ['question', 'answer'],
    });
    return rows.filter((r) => r.answer !== null) as Array<{ question: string; answer: string }>;
  }

  async startExecution(projectId: string, agentKey: string): Promise<string> {
    const id = randomUUID();
    await this.execRepo.save(this.execRepo.create({
      id, projectId, agentKey, status: 'RUNNING', startedAt: new Date(), retryCount: 0,
    }));
    return id;
  }

  async completeExecution(executionId: string, tokens: AgentTokens): Promise<void> {
    await this.execRepo.update(executionId, {
      status: 'COMPLETED', completedAt: new Date(),
      inputTokens: tokens.inputTokens, outputTokens: tokens.outputTokens, model: tokens.model,
    });
  }

  async failExecution(executionId: string, error: string): Promise<void> {
    await this.execRepo.update(executionId, { status: 'FAILED', completedAt: new Date(), error });
  }

  async deleteKnowledgeBySource(projectId: string, agentKey: string): Promise<void> {
    await this.kiRepo.delete({ projectId, source: agentKey });
  }

  async deleteValidationIssues(projectId: string): Promise<void> {
    await this.viRepo.delete({ projectId });
  }

  async deleteDocument(projectId: string): Promise<void> {
    await this.docRepo.delete({ projectId });
    await this.dvRepo.delete({ projectId });
  }
}
