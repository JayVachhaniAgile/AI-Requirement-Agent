import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { CanonicalItem, CanonicalItemVersion } from './canonical-item.entity';
import { CANONICAL_SCHEMAS, canonicalLlmInputSchema } from './canonical.schemas';
import { normalize } from './canonical.normalize';
import {
  isBlocking,
  validateBusinessRules,
  type BusinessIssue,
} from './canonical.validate';
import type {
  CanonicalKind,
  CanonicalObjectBase,
} from './canonical.types';

export interface IngestResult {
  item: CanonicalItem;
  version: number;
  issues: BusinessIssue[];
  repaired: boolean;
}

export interface IngestOptions {
  /** When true (default), high/critical issues throw and reject the input. */
  rejectOnBlocking?: boolean;
  /** When true, persist the parsed object even if minor issues exist. */
  persistWithIssues?: boolean;
  /** Metadata (skill version, prompt version, etc.) attached to the row. */
  metadata?: Record<string, unknown>;
  /** When true, run validation only and return an unsaved item (shadow mode). */
  dryRun?: boolean;
}

/**
 * CanonicalModelService (Phase 2).
 *
 * Implements the ingestion pipeline:
 *   raw LLM output (JSON)
 *     -> Zod schema validation
 *     -> normalization
 *     -> business validation
 *     -> persistence (with versioning + provenance)
 *
 * Persistence is blocked on blocking issues unless `rejectOnBlocking=false`.
 */
@Injectable()
export class CanonicalModelService {
  private readonly logger = new Logger(CanonicalModelService.name);

  constructor(
    @InjectRepository(CanonicalItem)
    private readonly itemRepo: Repository<CanonicalItem>,
    @InjectRepository(CanonicalItemVersion)
    private readonly versionRepo: Repository<CanonicalItemVersion>,
  ) {}

  /**
   * Parse + validate + persist an LLM-shaped payload.
   */
  async ingest(
    projectId: string,
    raw: unknown,
    options: IngestOptions = {},
  ): Promise<IngestResult> {
    const rejectOnBlocking = options.rejectOnBlocking ?? true;
    const persistWithIssues = options.persistWithIssues ?? false;

    // Stage 1: schema validation.
    const parsed = canonicalLlmInputSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Canonical LLM input failed schema validation',
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
          code: i.code,
        })),
      });
    }

    // Stage 2: normalization.
    const object: CanonicalObjectBase = normalize(parsed.data, projectId);

    // Stage 3: business validation.
    const business = validateBusinessRules(parsed.data);
    const blocking = isBlocking(business.issues);

    if (blocking && rejectOnBlocking) {
      throw new BadRequestException({
        message: 'Canonical LLM input failed business validation',
        issues: business.issues,
      });
    }

    if (blocking && !persistWithIssues) {
      // Defensive — should be unreachable given the throw above.
      throw new BadRequestException({ issues: business.issues });
    }

    // Stage 4: persist with versioning (or dry-run construction for shadow mode).
    if (options.dryRun) {
      const existing = await this.itemRepo.findOne({
        where: { projectId, kind: object.kind, externalId: object.externalId },
      });
      const nextVersion = existing ? existing.version + 1 : 1;
      const confidence = extractConfidence(object);
      const payload = {
        ...object.body,
        externalId: object.externalId,
        kind: object.kind,
        title: object.title,
        summary: object.summary ?? null,
        status: object.status,
        version: nextVersion,
      };
      const draft = this.itemRepo.create({
        id: randomUUID(),
        projectId,
        kind: object.kind,
        externalId: object.externalId,
        title: object.title,
        summary: object.summary ?? null,
        status: object.status,
        version: nextVersion,
        confidence,
        payload: payload as Record<string, unknown>,
        provenance: object.provenance as unknown as Record<string, unknown>,
        createdBy: object.provenance.producedBy ?? null,
        metadata: options.metadata ?? null,
      });
      return { item: draft, version: nextVersion, issues: business.issues, repaired: business.issues.length > 0 };
    }
    const { item, version } = await this.upsert(projectId, object, options.metadata);
    return { item, version, issues: business.issues, repaired: business.issues.length > 0 };
  }

  /** Fetch a single canonical item by (kind, externalId). */
  async findByExternalId(
    projectId: string,
    kind: CanonicalKind,
    externalId: string,
  ): Promise<CanonicalItem | null> {
    return this.itemRepo.findOne({
      where: { projectId, kind, externalId },
    });
  }

  /** List items by kind. */
  listByKind(projectId: string, kind: CanonicalKind): Promise<CanonicalItem[]> {
    return this.itemRepo.find({
      where: { projectId, kind },
      order: { createdAt: 'ASC' },
    });
  }

  listAll(projectId: string): Promise<CanonicalItem[]> {
    return this.itemRepo.find({
      where: { projectId },
      order: { kind: 'ASC', externalId: 'ASC' },
    });
  }

  /** Version history for one item. */
  async listVersions(
    projectId: string,
    kind: CanonicalKind,
    externalId: string,
  ): Promise<CanonicalItemVersion[]> {
    const item = await this.findByExternalId(projectId, kind, externalId);
    if (!item) {
      throw new NotFoundException(
        `Canonical item ${kind}/${externalId} not found in project ${projectId}`,
      );
    }
    return this.versionRepo.find({
      where: { itemId: item.id },
      order: { version: 'ASC' },
    });
  }

  /**
   * Return the provenance chain (all sources ever recorded for this item).
   * Answers "where did this requirement come from?" — the canonical
   * traceability question.
   */
  async getProvenance(
    projectId: string,
    kind: CanonicalKind,
    externalId: string,
  ): Promise<{
    epistemicClass: string;
    sources: Array<{ category: string; refId?: string; label?: string; excerpt?: string }>;
    producedBy?: string;
  } | null> {
    const item = await this.findByExternalId(projectId, kind, externalId);
    if (!item) return null;
    const provenance = item.provenance as {
      epistemicClass: string;
      sources: Array<{ category: string; refId?: string; label?: string; excerpt?: string }>;
      producedBy?: string;
    };
    return {
      epistemicClass: provenance.epistemicClass,
      sources: provenance.sources ?? [],
      producedBy: provenance.producedBy,
    };
  }

  /** Allow an integrator to call the canonical schema for a specific kind. */
  schemaFor(kind: CanonicalKind) {
    return CANONICAL_SCHEMAS[kind];
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async upsert(
    projectId: string,
    object: CanonicalObjectBase,
    metadata?: Record<string, unknown>,
  ): Promise<{ item: CanonicalItem; version: number }> {
    const existing = await this.itemRepo.findOne({
      where: {
        projectId,
        kind: object.kind,
        externalId: object.externalId,
      },
    });

    const nextVersion = existing ? existing.version + 1 : 1;
    const confidence = extractConfidence(object);

    const payload = {
      ...object.body,
      // Mirror top-level structured fields for convenient query/sort.
      externalId: object.externalId,
      kind: object.kind,
      title: object.title,
      summary: object.summary ?? null,
      status: object.status,
      version: nextVersion,
    };

    const row = existing ?? this.itemRepo.create({
      id: randomUUID(),
      projectId,
      kind: object.kind,
      externalId: object.externalId,
      title: object.title,
      summary: object.summary ?? null,
      status: object.status,
      version: nextVersion,
      confidence,
      payload: payload as Record<string, unknown>,
      provenance: object.provenance as unknown as Record<string, unknown>,
      createdBy: object.provenance.producedBy ?? null,
      metadata: metadata ?? null,
    });

    if (existing) {
      row.title = object.title;
      row.summary = object.summary ?? null;
      row.status = object.status;
      row.version = nextVersion;
      row.confidence = confidence;
      row.payload = payload as Record<string, unknown>;
      row.provenance = object.provenance as unknown as Record<string, unknown>;
      row.createdBy = object.provenance.producedBy ?? row.createdBy;
      row.metadata = metadata ?? row.metadata;
    }

    const saved = await this.itemRepo.save(row);

    // Snapshot the prior (or current) row into the versions table.
    const versionRow = this.versionRepo.create({
      id: randomUUID(),
      itemId: saved.id,
      projectId,
      kind: saved.kind,
      externalId: saved.externalId,
      version: nextVersion,
      status: saved.status,
      confidence: saved.confidence,
      payload: saved.payload,
      provenance: saved.provenance,
      createdBy: saved.createdBy,
      metadata: metadata ?? saved.metadata,
    });
    await this.versionRepo.save(versionRow);

    return { item: saved, version: nextVersion };
  }
}

function extractConfidence(object: CanonicalObjectBase): number | null {
  const body = object.body as { confidence?: { value?: number } };
  if (body.confidence?.value !== undefined) {
    return Math.max(0, Math.min(100, Math.round(body.confidence.value)));
  }
  return null;
}
