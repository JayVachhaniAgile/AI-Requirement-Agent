import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  KnowledgeItem,
  ClarificationQuestion,
  ValidationIssue,
  Document,
  AgentExecution,
} from '../database/entities';
import type { NewKnowledgeItem, NewQuestion, NewValidationIssue, AgentTokens } from '../agents/types';

@Injectable()
export class RkbService {
  constructor(
    @InjectRepository(KnowledgeItem) private readonly kiRepo: Repository<KnowledgeItem>,
    @InjectRepository(ClarificationQuestion) private readonly cqRepo: Repository<ClarificationQuestion>,
    @InjectRepository(ValidationIssue) private readonly viRepo: Repository<ValidationIssue>,
    @InjectRepository(Document) private readonly docRepo: Repository<Document>,
    @InjectRepository(AgentExecution) private readonly execRepo: Repository<AgentExecution>,
  ) {}

  async saveKnowledgeItems(projectId: string, items: NewKnowledgeItem[], agentKey: string): Promise<void> {
    if (items.length === 0) return;
    await this.kiRepo.save(items.map((item) => this.kiRepo.create({
      id: randomUUID(), projectId, externalId: item.externalId ?? null, type: item.type,
      title: item.title, description: item.description ?? null, status: item.status,
      source: agentKey, createdBy: agentKey, metadata: null, version: 1, relatedIds: item.relatedIds ?? [],
    })));
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

  async saveDocument(projectId: string, markdownContent: string): Promise<void> {
    const existing = await this.docRepo.findOne({ where: { projectId } });
    if (existing) {
      await this.docRepo.update(existing.id, { markdownContent, status: 'FINAL' });
    } else {
      await this.docRepo.save(this.docRepo.create({ id: randomUUID(), projectId, status: 'FINAL', markdownContent }));
    }
  }

  async getKnowledgeContext(projectId: string): Promise<Array<{ externalId: string | null; type: string; title: string; description: string | null; status: string }>> {
    return this.kiRepo.find({ where: { projectId }, select: ['externalId', 'type', 'title', 'description', 'status'] });
  }

  async getAnsweredQuestions(projectId: string): Promise<Array<{ question: string; answer: string }>> {
    const rows = await this.cqRepo.find({ where: { projectId, status: 'ANSWERED' }, select: ['question', 'answer'] });
    return rows.filter((r) => r.answer !== null) as Array<{ question: string; answer: string }>;
  }

  async startExecution(projectId: string, agentKey: string): Promise<string> {
    const id = randomUUID();
    await this.execRepo.save(this.execRepo.create({ id, projectId, agentKey, status: 'RUNNING', startedAt: new Date(), retryCount: 0 }));
    return id;
  }

  async completeExecution(executionId: string, tokens: AgentTokens): Promise<void> {
    await this.execRepo.update(executionId, { status: 'COMPLETED', completedAt: new Date(), inputTokens: tokens.inputTokens, outputTokens: tokens.outputTokens, model: tokens.model });
  }

  async failExecution(executionId: string, error: string): Promise<void> {
    await this.execRepo.update(executionId, { status: 'FAILED', completedAt: new Date(), error });
  }

  /** Remove knowledge produced by a specific agent (used when retrying that stage). */
  async deleteKnowledgeBySource(projectId: string, agentKey: string): Promise<void> {
    await this.kiRepo.delete({ projectId, source: agentKey });
  }

  async deleteValidationIssues(projectId: string): Promise<void> {
    await this.viRepo.delete({ projectId });
  }

  async deleteDocument(projectId: string): Promise<void> {
    await this.docRepo.delete({ projectId });
  }
}
