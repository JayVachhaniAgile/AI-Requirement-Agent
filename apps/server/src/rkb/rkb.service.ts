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
import { domainForType } from '../project-context/context-domains';
import { ModelUsageService } from '../foundation/observability/model-usage.service';
import { ArtifactRegistryService } from '../foundation/artifacts/artifact-registry.service';
import type {
  NewKnowledgeItem,
  NewQuestion,
  NewValidationIssue,
  AgentTokens,
} from '../agents/types';

@Injectable()
export class RkbService {
  private readonly logger = new Logger(RkbService.name);

  constructor(
    @InjectRepository(KnowledgeItem) private readonly kiRepo: Repository<KnowledgeItem>,
    @InjectRepository(ClarificationQuestion)
    private readonly cqRepo: Repository<ClarificationQuestion>,
    @InjectRepository(ValidationIssue) private readonly viRepo: Repository<ValidationIssue>,
    @InjectRepository(Document) private readonly docRepo: Repository<Document>,
    @InjectRepository(DocumentVersion) private readonly dvRepo: Repository<DocumentVersion>,
    @InjectRepository(AgentExecution) private readonly execRepo: Repository<AgentExecution>,
    private readonly usage: ModelUsageService,
    private readonly artifactRegistry: ArtifactRegistryService,
  ) {}

  async saveKnowledgeItems(
    projectId: string,
    items: NewKnowledgeItem[],
    agentKey: string,
  ): Promise<void> {
    if (items.length === 0) return;
    await this.kiRepo.save(
      items.map((item) => {
        const metadataObj: Record<string, unknown> = {};
        if (item.sourceCategory) metadataObj.sourceCategory = item.sourceCategory;
        if (item.evidence) metadataObj.evidence = item.evidence;
        if (item.reasoning) metadataObj.reasoning = item.reasoning;
        if (item.confidence !== undefined) metadataObj.confidence = item.confidence;
        return this.kiRepo.create({
          id: randomUUID(),
          projectId,
          externalId: item.externalId ?? null,
          type: item.type,
          domain: domainForType(item.type) ?? null,
          title: item.title,
          description: item.description ?? null,
          status: item.status,
          source: item.sourceCategory ? `${agentKey}::${item.sourceCategory}` : agentKey,
          createdBy: agentKey,
          metadata: Object.keys(metadataObj).length > 0 ? JSON.stringify(metadataObj) : null,
          version: 1,
          relatedIds: item.relatedIds ?? [],
        });
      }),
    );
  }

  async saveQuestions(projectId: string, questions: NewQuestion[]): Promise<void> {
    if (questions.length === 0) return;
    await this.cqRepo.save(
      questions.map((q) =>
        this.cqRepo.create({
          id: randomUUID(),
          projectId,
          question: q.question,
          context: q.context ?? null,
          isBlocking: q.isBlocking,
          status: 'PENDING',
        }),
      ),
    );
  }

  async saveValidationIssues(
    projectId: string,
    issues: NewValidationIssue[],
    agentKey: string,
  ): Promise<void> {
    if (issues.length === 0) return;
    await this.viRepo.save(
      issues.map((issue) =>
        this.viRepo.create({
          id: randomUUID(),
          projectId,
          externalId: issue.externalId ?? null,
          severity: issue.severity,
          category: issue.category,
          sourceAgent: issue.sourceAgent ?? agentKey,
          affectedIds: issue.affectedIds ?? [],
          problem: issue.problem,
          evidence: issue.evidence ?? null,
          impact: issue.impact ?? null,
          recommendedCorrection: issue.recommendedCorrection ?? null,
          responsibleAgent: issue.responsibleAgent ?? null,
          requiresHumanDecision: issue.requiresHumanDecision ?? false,
          status: 'OPEN',
        }),
      ),
    );
  }

  /**
   * Save a document version snapshot, then update the current document.
   *
   * Versioning is per-document: the version counter is scoped to
   * (projectId, documentType), so each generated document has its own
   * Version 1 and a regeneration only bumps that document's version.
   *
   * Pass `{ createVersion: false }` to update the existing document and its
   * latest version in place (used by gap-analysis so targeted fixes never
   * accumulate document versions).
   */
  async saveDocument(
    projectId: string,
    markdownContent: string,
    changeSummary?: string,
    triggerEvent?: string,
    documentType: string = 'COMPILED_DOCUMENT',
    options: { createVersion?: boolean } = {},
  ): Promise<void> {
    const createVersion = options.createVersion !== false;

    const latestVersion = await this.dvRepo.findOne({
      where: { projectId, documentType },
      order: { version: 'DESC' },
    });

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

    if (createVersion) {
      // Save a new version snapshot.
      const nextVersion = (latestVersion?.version ?? 0) + 1;
      await this.dvRepo.save(
        this.dvRepo.create({
          id: randomUUID(),
          projectId,
          documentType,
          version: nextVersion,
          markdownContent,
          changeSummary: changeSummary ?? null,
          affectedItemIds,
          triggerEvent: triggerEvent ?? null,
        }),
      );
    } else if (latestVersion) {
      // Update the existing latest version in place — no new version rows.
      await this.dvRepo.update(latestVersion.id, {
        markdownContent,
        changeSummary: changeSummary ?? null,
        affectedItemIds,
        triggerEvent: triggerEvent ?? null,
      });
    } else {
      // No version exists yet: create the first version.
      await this.dvRepo.save(
        this.dvRepo.create({
          id: randomUUID(),
          projectId,
          documentType,
          version: 1,
          markdownContent,
          changeSummary: changeSummary ?? null,
          affectedItemIds,
          triggerEvent: triggerEvent ?? null,
        }),
      );
    }

    // Update or create current document
    const existing = await this.docRepo.findOne({ where: { projectId, documentType } });
    if (existing) {
      await this.docRepo.update(existing.id, {
        markdownContent,
        status: 'FINAL',
      });
    } else {
      await this.docRepo.save(
        this.docRepo.create({
          id: randomUUID(),
          projectId,
          status: 'FINAL',
          markdownContent,
          documentType,
        }),
      );
    }

    this.logger.log(
      `Document ${createVersion ? `v${(latestVersion?.version ?? 0) + 1}` : `v${latestVersion?.version ?? 1}`} saved for project ${projectId} (${affectedItemIds.length} items affected)`,
    );

    // Artifact registry integration: keep the artifact graph in sync with
    // every saved document (best-effort — a registry failure never breaks
    // the document save).
    try {
      await this.artifactRegistry.upsertArtifact({
        projectId,
        type: documentType,
        key: documentType,
        title: changeSummary ?? `${documentType} document`,
        summary: markdownContent.slice(0, 500),
        content: markdownContent,
        status: 'COMPLETED',
        source: triggerEvent ?? undefined,
        createdBy: triggerEvent ?? undefined,
      });
    } catch (err) {
      this.logger.warn(
        `Artifact registration failed (${projectId}/${documentType}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /** Get all document versions for a project */
  async getDocumentVersions(projectId: string): Promise<DocumentVersion[]> {
    return this.dvRepo.find({
      where: { projectId },
      order: { version: 'DESC' },
    });
  }

  /** All generated documents for a project (current versions by type). */
  async getDocumentsByType(projectId: string): Promise<Document[]> {
    return this.docRepo.find({
      where: { projectId },
      order: { updatedAt: 'ASC' },
    });
  }

  /** Current document for a specific type, or null when none exists. */
  async getDocumentByType(projectId: string, documentType: string): Promise<Document | null> {
    return this.docRepo.findOne({ where: { projectId, documentType } });
  }

  /** Get a specific version */
  async getDocumentVersion(projectId: string, version: number): Promise<DocumentVersion | null> {
    return this.dvRepo.findOne({ where: { projectId, version } });
  }

  async getKnowledgeContext(projectId: string): Promise<
    Array<{
      externalId: string | null;
      type: string;
      title: string;
      description: string | null;
      status: string;
      source?: string | null;
      sourceCategory?: string;
    }>
  > {
    const items = await this.kiRepo.find({
      where: { projectId },
      select: ['externalId', 'type', 'title', 'description', 'status', 'source', 'metadata'],
    });
    return items.map((item) => {
      const meta = item.metadata ? JSON.parse(item.metadata) : {};
      return {
        externalId: item.externalId,
        type: item.type,
        title: item.title,
        description: item.description,
        status: item.status,
        source: item.source ?? null,
        sourceCategory: meta.sourceCategory ?? undefined,
      };
    });
  }

  async getAnsweredQuestions(
    projectId: string,
  ): Promise<Array<{ question: string; answer: string }>> {
    const rows = await this.cqRepo.find({
      where: { projectId, status: 'ANSWERED' },
      select: ['question', 'answer'],
    });
    return rows.filter((r) => r.answer !== null) as Array<{ question: string; answer: string }>;
  }

  async startExecution(projectId: string, agentKey: string): Promise<string> {
    const id = randomUUID();
    await this.execRepo.save(
      this.execRepo.create({
        id,
        projectId,
        agentKey,
        status: 'RUNNING',
        startedAt: new Date(),
        retryCount: 0,
      }),
    );
    return id;
  }

  async completeExecution(executionId: string, tokens: AgentTokens): Promise<void> {
    const execution = await this.execRepo.findOne({ where: { id: executionId } });
    await this.execRepo.update(executionId, {
      status: 'COMPLETED',
      completedAt: new Date(),
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      model: tokens.model,
    });
    // Observability integration: record the model usage row (best-effort —
    // a usage-recording failure must never break execution completion).
    if (execution) {
      try {
        await this.usage.record({
          projectId: execution.projectId,
          workflowExecutionId: executionId,
          model: tokens.model,
          inputTokens: tokens.inputTokens,
          outputTokens: tokens.outputTokens,
          metadata: { agentKey: execution.agentKey },
        });
      } catch (err) {
        this.logger.warn(
          `Model usage recording failed (${executionId}): ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  async failExecution(executionId: string, error: string): Promise<void> {
    await this.execRepo.update(executionId, { status: 'FAILED', completedAt: new Date(), error });
  }

  async deleteKnowledgeBySource(projectId: string, agentKey: string): Promise<void> {
    await this.kiRepo.delete({ projectId, source: agentKey });
  }

  async deleteKnowledgeByCreatedBy(projectId: string, agentKey: string): Promise<void> {
    const safeAgentKey = agentKey.replace(/[\\%_]/g, '\\$&');
    const prefix = `${safeAgentKey}::`;
    await this.kiRepo.delete({ projectId, createdBy: agentKey });
    await this.kiRepo
      .createQueryBuilder()
      .delete()
      .from(KnowledgeItem)
      .where('project_id = :pid AND source LIKE :pattern ESCAPE :esc', {
        pid: projectId,
        pattern: prefix,
        esc: '\\',
      })
      .execute();
  }

  async deleteValidationIssues(projectId: string): Promise<void> {
    await this.viRepo.delete({ projectId });
  }

  /**
   * Delete the current document row(s) for a project. Version snapshots are
   * intentionally preserved: regenerating a document bumps its version
   * instead of destroying history. Pass `documentType` to scope the deletion
   * to a single document (other documents and all versions stay intact).
   */
  async deleteDocument(projectId: string, documentType?: string): Promise<void> {
    if (documentType) {
      await this.docRepo.delete({ projectId, documentType });
    } else {
      await this.docRepo.delete({ projectId });
    }
  }

  /**
   * Full reset used only by pipeline-internal restarts (e.g. re-running the
   * whole workflow from DISCOVERY): removes current document rows AND version
   * snapshots so regenerated documents start at Version 1 again.
   */
  async deleteDocumentAndVersions(projectId: string): Promise<void> {
    await this.docRepo.delete({ projectId });
    await this.dvRepo.delete({ projectId });
  }

  /**
   * Full pipeline restart wipe: knowledge, validation issues, and all document
   * rows + versions so a new run starts clean (no duplicate RKB items).
   */
  async resetPipelineArtifacts(projectId: string): Promise<void> {
    await this.kiRepo.delete({ projectId });
    await this.viRepo.delete({ projectId });
    await this.deleteDocumentAndVersions(projectId);
  }
}

