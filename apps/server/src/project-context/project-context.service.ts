import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, In, MoreThan, Not, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  KnowledgeItem,
  ProjectContextCommit,
  ProjectContextItem,
  ProjectContextSnapshot,
} from '../database/entities';
import { digestKnowledgeItems } from '../agents/context-digest';
import type { KnowledgeItemSummary } from '../agents/types';
import {
  type ContextChange,
  type CommitActor,
  type ExistingContextItem,
  resolveChanges,
} from './conflict-resolver';
import {
  ALL_DOMAINS,
  CONTEXT_DOMAINS,
  CONTEXT_OPERATIONS,
  DOMAIN_LABELS,
  domainForType,
  domainsForAgent,
  isContextDomain,
  type ContextDomain,
} from './context-domains';
import {
  ProjectContextEventsService,
  type ContextDelta,
} from './project-context-events.service';

export interface ContextItemView {
  id: string;
  projectId: string;
  domain: string;
  externalId: string | null;
  type: string;
  title: string;
  body: string | null;
  producerAgent: string | null;
  status: string;
  version: number;
  relatedIds: string[];
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommitRequest {
  actorKey: string;
  actorType?: 'agent' | 'user' | 'system';
  changes: ContextChange[];
  reason?: string;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class ProjectContextService {
  private readonly logger = new Logger(ProjectContextService.name);

  constructor(
    @InjectRepository(ProjectContextItem)
    private readonly itemRepo: Repository<ProjectContextItem>,
    @InjectRepository(ProjectContextSnapshot)
    private readonly snapshotRepo: Repository<ProjectContextSnapshot>,
    @InjectRepository(ProjectContextCommit)
    private readonly commitRepo: Repository<ProjectContextCommit>,
    @InjectRepository(KnowledgeItem)
    private readonly knowledgeRepo: Repository<KnowledgeItem>,
    private readonly dataSource: DataSource,
    private readonly events: ProjectContextEventsService,
  ) {}

  /** Atomically apply a commit. Rejects with a 409 when any change conflicts. */
  async applyCommit(projectId: string, request: CommitRequest) {
    if (!request.actorKey) {
      throw new BadRequestException('actorKey is required');
    }
    if (!Array.isArray(request.changes) || request.changes.length === 0) {
      throw new BadRequestException('changes must be a non-empty array');
    }
    for (const change of request.changes) {
      if (!change || typeof change.domain !== 'string') {
        throw new BadRequestException('each change requires a domain');
      }
      if (!isContextDomain(change.domain)) {
        throw new BadRequestException(`unknown context domain: ${change.domain}`);
      }
      if (!CONTEXT_OPERATIONS.includes(change.operation)) {
        throw new BadRequestException(`unknown operation: ${String(change.operation)}`);
      }
      if (change.externalId === null || change.externalId === undefined) {
        throw new BadRequestException('each change requires an externalId');
      }
      if (
        (change.operation === 'create' || change.operation === 'supersede') &&
        !change.item?.title
      ) {
        throw new BadRequestException(`${change.operation} requires item.title`);
      }
    }

    const actor: CommitActor = { type: request.actorType ?? 'agent', key: request.actorKey };

    const domains = [...new Set(request.changes.map((c) => c.domain))];
    const items = await this.itemRepo.find({
      where: { projectId, domain: In(domains) },
    });
    const byKey = new Map<string, ProjectContextItem>();
    const existingByKey = new Map<string, ExistingContextItem>();
    for (const item of items) {
      const key = contextKey(item.domain, item.externalId);
      byKey.set(key, item);
      existingByKey.set(key, {
        id: item.id,
        domain: item.domain,
        externalId: item.externalId,
        version: item.version,
        status: item.status,
        producerAgent: item.producerAgent,
      });
    }

    const { plans, conflicts } = resolveChanges(request.changes, existingByKey, actor);
    if (conflicts.length > 0) {
      throw new ConflictException({
        error: 'context_conflict',
        conflicts,
        hint: 're-fetch the context view and retry with fresh expectedVersion values',
      });
    }

    const commitId = randomUUID();
    const touched: ProjectContextItem[] = [];
    const deltas: ContextDelta[] = [];
    const appliedItems: Array<{
      domain: string;
      externalId: string | null;
      operation: string;
      version: number;
    }> = [];

    await this.dataSource.transaction(async (manager) => {
      const itemRepo = manager.getRepository(ProjectContextItem);
      const snapRepo = manager.getRepository(ProjectContextSnapshot);
      const commitRepo = manager.getRepository(ProjectContextCommit);

      for (const plan of plans) {
        if (plan.mode === 'noop') continue;
        const at = new Date().toISOString();

        if (plan.mode === 'create') {
          const entity = itemRepo.create({
            id: randomUUID(),
            projectId,
            domain: plan.change.domain,
            externalId: plan.change.externalId,
            type: plan.change.item?.type ?? plan.change.domain.toUpperCase(),
            title: plan.change.item?.title ?? '',
            body: plan.change.item?.body ?? null,
            producerAgent: actor.key,
            status: plan.change.item?.status ?? 'DRAFT',
            version: 1,
            relatedIds: plan.change.item?.relatedIds ?? [],
            metadata: plan.change.item?.metadata
              ? JSON.stringify(plan.change.item.metadata)
              : null,
          });
          await itemRepo.save(entity);
          touched.push(entity);
          appliedItems.push({
            domain: entity.domain,
            externalId: entity.externalId,
            operation: 'create',
            version: 1,
          });
          deltas.push({
            projectId,
            commitId,
            domain: entity.domain,
            externalId: entity.externalId,
            itemId: entity.id,
            itemVersion: 1,
            operation: 'create',
            actorType: actor.type,
            actorKey: actor.key,
            at,
          });
          continue;
        }

        // update | supersede | delete — all operate on an existing item.
        const existing = byKey.get(contextKey(plan.change.domain, plan.change.externalId));
        if (!existing) continue;

        await snapRepo.save(
          snapRepo.create({
            id: randomUUID(),
            itemId: existing.id,
            projectId,
            version: existing.version,
            snapshotJson: serializeItem(existing),
            changeSummary: plan.change.reason ?? null,
            commitId,
            triggerEvent:
              plan.mode === 'delete'
                ? 'context_delete'
                : plan.mode === 'supersede'
                  ? 'context_supersede'
                  : 'context_update',
          }),
        );

        const nextVersion = existing.version + 1;
        existing.version = nextVersion;

        if (plan.mode === 'delete') {
          existing.status = 'SUPERSEDED';
          existing.metadata = mergeMetadata(existing.metadata, {
            supersededBy: actor.key,
            reason: plan.change.reason ?? null,
            at,
          });
        } else {
          // update | supersede
          if (plan.change.item?.title !== undefined) existing.title = plan.change.item.title;
          if (plan.change.item?.body !== undefined) existing.body = plan.change.item.body;
          if (plan.change.item?.type) existing.type = plan.change.item.type;
          if (plan.change.item?.relatedIds) existing.relatedIds = plan.change.item.relatedIds;
          if (plan.change.item?.status) existing.status = plan.change.item.status;
          if (plan.change.item?.metadata) {
            existing.metadata = JSON.stringify(plan.change.item.metadata);
          }
          if (plan.mode === 'supersede') {
            existing.producerAgent = actor.key;
            existing.metadata = mergeMetadata(existing.metadata, {
              supersedes: {
                previousProducerAgent: plan.existing?.producerAgent ?? null,
                previousVersion: plan.existing?.version ?? 1,
                reason: plan.change.reason ?? null,
              },
            });
          }
        }

        await itemRepo.save(existing);
        touched.push(existing);
        appliedItems.push({
          domain: existing.domain,
          externalId: existing.externalId,
          operation: plan.mode,
          version: nextVersion,
        });
        deltas.push({
          projectId,
          commitId,
          domain: existing.domain,
          externalId: existing.externalId,
          itemId: existing.id,
          itemVersion: nextVersion,
          operation: plan.mode,
          actorType: actor.type,
          actorKey: actor.key,
          at,
        });
      }

      const changeType = summarizeChangeType(plans);
      await commitRepo.save(
        commitRepo.create({
          id: commitId,
          projectId,
          actorKey: actor.key,
          actorType: actor.type,
          changeType,
          affectedItemIds: touched.map((t) => t.id),
          reason: request.reason ?? null,
          metadata: request.metadata ? JSON.stringify(request.metadata) : null,
        }),
      );
    });

    for (const delta of deltas) {
      this.events.publish(delta);
    }

    this.logger.log(
      `Context commit ${commitId} applied ${deltas.length} change(s) to project ${projectId}`,
    );

    return {
      commitId,
      changeType: summarizeChangeType(plans),
      applied: deltas.length,
      items: appliedItems,
      conflicts: [],
    };
  }

  /** Domain-filtered read view of the live context (SUPERSEDED excluded). */
  async getView(
    projectId: string,
    options: {
      domains?: string[];
      includeSuperseded?: boolean;
      updatedSince?: string;
    } = {},
  ): Promise<{ projectId: string; items: ContextItemView[] }> {
    const domains =
      options.domains && options.domains.length > 0
        ? options.domains.filter(isContextDomain)
        : [...ALL_DOMAINS];

    const where: FindOptionsWhere<ProjectContextItem> = { projectId, domain: In(domains) };
    if (!options.includeSuperseded) {
      where.status = Not('SUPERSEDED');
    }
    if (options.updatedSince) {
      where.updatedAt = MoreThan(new Date(options.updatedSince));
    }

    const items = await this.itemRepo.find({
      where,
      order: { domain: 'ASC', externalId: 'ASC' },
    });
    return { projectId, items: items.map(toView) };
  }

  /**
   * Consumer-specific digest used to build agent prompts: filters to the
   * domains the agent declares, then applies AGENT_DIGEST_CONFIG detail
   * tiering (full for immediate upstream, externalId/title/one-line for the
   * rest).
   */
  async getDigest(
    projectId: string,
    consumerAgent: string,
    options: { domains?: string[] } = {},
  ): Promise<{
    projectId: string;
    consumerAgent: string;
    domains: ContextDomain[];
    items: KnowledgeItemSummary[];
  }> {
    const domains =
      options.domains && options.domains.length > 0
        ? options.domains.filter(isContextDomain)
        : [...domainsForAgent(consumerAgent)];

    const items = await this.itemRepo.find({
      where: { projectId, domain: In(domains), status: Not('SUPERSEDED') },
      order: { domain: 'ASC', createdAt: 'ASC' },
    });

    const summaries: KnowledgeItemSummary[] = items.map((i) => ({
      externalId: i.externalId,
      type: i.type,
      title: i.title,
      description: i.body,
      status: i.status,
      source: i.producerAgent ?? undefined,
    }));

    return {
      projectId,
      consumerAgent,
      domains,
      items: digestKnowledgeItems(summaries, consumerAgent),
    };
  }

  /** Fetch a single item; pass `version` to read an immutable snapshot. */
  async getItem(
    projectId: string,
    domain: string,
    externalId: string,
    version?: number,
  ): Promise<ContextItemView | Record<string, unknown>> {
    const item = await this.itemRepo.findOne({ where: { projectId, domain, externalId } });
    if (!item) {
      throw new NotFoundException(`context item ${domain}:${externalId} not found`);
    }
    if (version === undefined) return toView(item);

    const snapshot = await this.snapshotRepo.findOne({
      where: { itemId: item.id, version },
    });
    if (!snapshot) {
      throw new NotFoundException(`version ${version} not found for ${domain}:${externalId}`);
    }
    return {
      ...safeParse(snapshot.snapshotJson),
      snapshotVersion: version,
      changeSummary: snapshot.changeSummary,
      createdAt: snapshot.createdAt,
    };
  }

  /** Snapshot history for an item (by itemId, or by domain + externalId). */
  async getVersions(
    projectId: string,
    query: { itemId?: string; domain?: string; externalId?: string },
  ): Promise<Array<Record<string, unknown>>> {
    let itemId = query.itemId;
    if (!itemId && query.domain && query.externalId) {
      const item = await this.itemRepo.findOne({
        where: { projectId, domain: query.domain, externalId: query.externalId },
      });
      itemId = item?.id;
    }
    if (!itemId) return [];

    const rows = await this.snapshotRepo.find({
      where: { itemId, projectId },
      order: { version: 'DESC' },
    });
    return rows.map((r) => ({
      id: r.id,
      version: r.version,
      changeSummary: r.changeSummary,
      triggerEvent: r.triggerEvent,
      commitId: r.commitId,
      snapshot: safeParse(r.snapshotJson),
      createdAt: r.createdAt,
    }));
  }

  /** Append-only commit log (newest first). */
  async getCommits(
    projectId: string,
    limit = 50,
    before?: string,
  ): Promise<Array<Record<string, unknown>>> {
    const qb = this.commitRepo
      .createQueryBuilder('c')
      .where('c.project_id = :projectId', { projectId })
      .orderBy('c.created_at', 'DESC')
      .take(Math.min(Math.max(limit, 1), 200));
    if (before) {
      qb.andWhere('c.created_at < :before', { before: new Date(before) });
    }
    const rows = await qb.getMany();
    return rows.map((r) => ({
      id: r.id,
      actorKey: r.actorKey,
      actorType: r.actorType,
      changeType: r.changeType,
      affectedItemIds: r.affectedItemIds,
      reason: r.reason,
      metadata: safeParse(r.metadata),
      createdAt: r.createdAt,
    }));
  }

  /** Per-domain counts (drives the context dashboard). */
  async getDomainStats(projectId: string): Promise<{
    projectId: string;
    domains: Array<{ key: string; label: string }>;
    stats: Record<string, { total: number; byStatus: Record<string, number> }>;
  }> {
    const items = await this.itemRepo.find({ where: { projectId } });
    const stats: Record<string, { total: number; byStatus: Record<string, number> }> = {};
    for (const domain of CONTEXT_DOMAINS) {
      stats[domain] = { total: 0, byStatus: {} };
    }
    for (const item of items) {
      const entry = stats[item.domain] ?? { total: 0, byStatus: {} };
      entry.total += 1;
      entry.byStatus[item.status] = (entry.byStatus[item.status] ?? 0) + 1;
      stats[item.domain] = entry;
    }
    return {
      projectId,
      domains: CONTEXT_DOMAINS.map((d) => ({ key: d, label: DOMAIN_LABELS[d] })),
      stats,
    };
  }

  /**
   * Idempotent seed from the legacy `knowledge_items` table using the
   * DOMAIN_TYPES mapping. Items already present (by domain + externalId) are
   * skipped; legacy rows without an externalId get `LEGACY-<knowledgeItemId>`.
   */
  async backfill(projectId: string): Promise<{
    projectId: string;
    created: number;
    skipped: number;
    commitId: string | null;
  }> {
    const knowledgeItems = await this.knowledgeRepo.find({ where: { projectId } });
    let created = 0;
    let skipped = 0;
    let commitId: string | null = null;

    await this.dataSource.transaction(async (manager) => {
      const itemRepo = manager.getRepository(ProjectContextItem);
      const commitRepo = manager.getRepository(ProjectContextCommit);
      const touchedIds: string[] = [];

      for (const k of knowledgeItems) {
        const domain = domainForType(k.type);
        if (!domain) {
          skipped += 1;
          continue;
        }
        const externalId = k.externalId ?? `LEGACY-${k.id}`;
        const existing = await itemRepo.findOne({ where: { projectId, domain, externalId } });
        if (existing) {
          skipped += 1;
          continue;
        }
        const metadata = {
          ...safeParse(k.metadata),
          legacyKnowledgeItemId: k.id,
          legacyType: k.type,
        };
        const entity = itemRepo.create({
          id: randomUUID(),
          projectId,
          domain,
          externalId,
          type: k.type,
          title: k.title,
          body: k.description,
          producerAgent: k.createdBy ?? k.source ?? null,
          status: k.status,
          version: 1,
          relatedIds: k.relatedIds ?? [],
          metadata: JSON.stringify(metadata),
        });
        await itemRepo.save(entity);
        created += 1;
        touchedIds.push(entity.id);
      }

      if (created > 0) {
        commitId = randomUUID();
        await commitRepo.save(
          commitRepo.create({
            id: commitId,
            projectId,
            actorKey: 'system',
            actorType: 'system',
            changeType: 'BACKFILL',
            affectedItemIds: touchedIds,
            reason: `backfill from knowledge_items (${created} items)`,
            metadata: null,
          }),
        );
      }
    });

    return { projectId, created, skipped, commitId };
  }
}

function contextKey(domain: string, externalId: string | null): string {
  return `${domain}|${externalId ?? ''}`;
}

function toView(item: ProjectContextItem): ContextItemView {
  return {
    id: item.id,
    projectId: item.projectId,
    domain: item.domain,
    externalId: item.externalId,
    type: item.type,
    title: item.title,
    body: item.body,
    producerAgent: item.producerAgent,
    status: item.status,
    version: item.version,
    relatedIds: item.relatedIds,
    metadata: safeParse(item.metadata),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function serializeItem(item: ProjectContextItem): string {
  return JSON.stringify(toView(item));
}

function safeParse(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function mergeMetadata(
  existing: string | null | undefined,
  extra: Record<string, unknown>,
): string {
  return JSON.stringify({ ...(safeParse(existing) ?? {}), ...extra });
}

function summarizeChangeType(
  plans: Array<{ mode: string }>,
): string {
  const applied = plans.filter((p) => p.mode !== 'noop').map((p) => p.mode);
  if (applied.length === 0) return 'NOOP';
  const unique = [...new Set(applied)];
  if (unique.length === 1) return unique[0].toUpperCase();
  return 'MIXED';
}
