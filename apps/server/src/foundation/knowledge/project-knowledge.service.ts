import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { KnowledgeItem } from '../../database/entities';
import { domainForType } from '../../project-context/context-domains';

export interface NewProjectKnowledgeItem {
  externalId?: string;
  type: string;
  title: string;
  description?: string | null;
  status?: string;
  source?: string;
  createdBy?: string;
  metadata?: Record<string, unknown>;
  relatedIds?: string[];
}

export interface KnowledgeDigestItem {
  externalId: string | null;
  type: string;
  title: string;
  description: string | null;
  status: string;
  source: string | null;
  domain: string | null;
}

/**
 * Project Knowledge (new architecture).
 *
 * A thin, typed gateway over the legacy `knowledge_items` table that adds
 * canonical-domain mapping and snapshot digests. Existing writers
 * (`RkbService`) keep writing directly — this service is additive.
 */
@Injectable()
export class ProjectKnowledgeService {
  private readonly logger = new Logger(ProjectKnowledgeService.name);

  constructor(
    @InjectRepository(KnowledgeItem)
    private readonly kiRepo: Repository<KnowledgeItem>,
  ) {}

  list(projectId: string, type?: string): Promise<KnowledgeItem[]> {
    return this.kiRepo.find({
      where: type ? { projectId, type } : { projectId },
      order: { createdAt: 'ASC' },
    });
  }

  getById(projectId: string, id: string): Promise<KnowledgeItem | null> {
    return this.kiRepo.findOne({ where: { id, projectId } });
  }

  add(input: NewProjectKnowledgeItem): Promise<KnowledgeItem> {
    const row = this.kiRepo.create({
      id: randomUUID(),
      externalId: input.externalId ?? null,
      type: input.type,
      domain: domainForType(input.type),
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? 'DRAFT',
      source: input.source ?? null,
      createdBy: input.createdBy ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      relatedIds: input.relatedIds ?? [],
      version: 1,
    });
    return this.kiRepo.save(row);
  }

  /** Canonical digest for snapshots/context (no huge descriptions). */
  async digest(projectId: string, type?: string): Promise<KnowledgeDigestItem[]> {
    const items = await this.list(projectId, type);
    return items.map((item) => ({
      externalId: item.externalId,
      type: item.type,
      title: item.title,
      description: item.description ? item.description.slice(0, 500) : null,
      status: item.status,
      source: item.source,
      domain: item.domain,
    }));
  }

  count(projectId: string): Promise<number> {
    return this.kiRepo.count({ where: { projectId } });
  }
}
