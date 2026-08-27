import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project, KnowledgeItem } from '../../database/entities';
import { CanonicalItem } from '../canonical/canonical-item.entity';
import { deduplicate, filterByConfidence, rankScore, recencyScore } from './context.ranker';
import type { DependencyNeighbor, DependencyResolver } from './dependency-resolver';
import { ContextCache } from './context.cache';
import { estimateTokens, loadBudgets, truncateToTokens } from './context.token-budget';
import type {
  ContextEvidence,
  ContextItem,
  ContextPackage,
  ContextRequest,
  ContextSourceRef,
  ContextTaskType,
} from './context.types';

/**
 * Context Engine (Phase 3) — the hybrid retriever + compiler.
 *
 * ONE project knowledge base → Context Engine → task-specific context → agent.
 *
 * Retrieval is hybrid:
 *  - structured DB queries for canonical objects, knowledge items, artifacts
 *  - lexical (token-overlap) retrieval for long/unstructured evidence
 *  - vector retrieval is a future hook — never the only mechanism
 *
 * Compilation pipeline (per request):
 *   determine required info → retrieve structured → retrieve semantic evidence
 *   → rank → dedupe → compress → enforce token budget → package
 *
 * Caching: same request + unchanged source versions → cache hit.
 */
@Injectable()
export class ContextEngineService {
  private readonly logger = new Logger(ContextEngineService.name);
  private readonly cache: ContextCache;
  private readonly budgets: Record<ContextTaskType, number>;
  private readonly dependencyResolver: DependencyResolver;

  constructor(
    @InjectRepository(Project) private readonly projectRepo: Repository<Project>,
    @InjectRepository(KnowledgeItem) private readonly kiRepo: Repository<KnowledgeItem>,
    @InjectRepository(CanonicalItem) private readonly canonicalRepo: Repository<CanonicalItem>,
    @Optional() cache?: ContextCache,
    @Optional() env?: Record<string, string | undefined>,
    @Optional() dependencyResolver?: DependencyResolver,
  ) {
    this.cache = cache ?? new ContextCache({ maxEntries: 128 });
    this.budgets = loadBudgets(env ?? process.env);
    this.dependencyResolver = dependencyResolver ?? noopResolver;
  }

  /** Resolve the effective maxTokens from the request or the task budget. */
  static effectiveBudget(request: ContextRequest, budgets: Record<ContextTaskType, number>): number {
    if (request.maxTokens > 0) return request.maxTokens;
    return budgets[request.taskType] ?? 12000;
  }

  async compile(request: ContextRequest, forceRefresh = false): Promise<ContextPackage> {
    const start = Date.now();
    const sources: ContextSourceRef[] = await this.collectSources(request);
    const fingerprint = ContextCache.sourceFingerprint(sources);
    const key = ContextCache.buildKey(request, fingerprint);

    if (!forceRefresh) {
      const cached = this.cache.get(key);
      if (cached) {
        this.logger.debug(`Context cache hit for ${request.agentSkill} (${key})`);
        const pkg = { ...cached.package, cached: true, cacheKey: key };
        return pkg;
      }
    }

    const warnings: string[] = [];
    const maxTokens = ContextEngineService.effectiveBudget(request, this.budgets);

    const projectSummary = await this.projectSummary(request.projectId);

    // Structured retrieval (canonical + legacy knowledge items).
    const canonicalItems = await this.canonicalRepo.find({
      where: { projectId: request.projectId },
    });
    const knowledgeItems = await this.kiRepo.find({
      where: { projectId: request.projectId },
    });

    const structured: ContextItem[] = [
      ...canonicalItems.map((c) => this.canonicalToContextItem(c)),
      ...knowledgeItems.map((k) => this.knowledgeToContextItem(k)),
    ];

    // Conflicting context detection: the same externalId present in both the
    // canonical model and the legacy knowledge base with divergent summaries.
    const canonicalById = new Map(
      canonicalItems.filter((c) => c.externalId).map((c) => [c.externalId, c]),
    );
    for (const k of knowledgeItems) {
      if (!k.externalId) continue;
      const canonical = canonicalById.get(k.externalId);
      if (!canonical) continue;
      const a = (canonical.summary ?? '').replace(/\s+/g, ' ').trim();
      const b = (k.description ?? '').replace(/\s+/g, ' ').trim();
      if (a && b && a.slice(0, 80) !== b.slice(0, 80)) {
        warnings.push(
          `CONFLICTING_SOURCES: '${k.externalId}' exists in canonical_items and knowledge_items with different content.`,
        );
      }
    }

    const filtered = filterByConfidence(structured, request.confidenceThreshold);
    const now = new Date();

    // Score + rank.
    const ranked = filtered
      .map((item) => {
        const pinned = request.artifactIds?.includes(item.source.externalId) ?? false;
        const domainMatch =
          (request.domains?.length ?? 0) === 0 ||
          (request.domains ?? []).some((d) =>
            String(item.source.kind).toLowerCase().includes(d.toLowerCase()),
          );
        return {
          item,
          score: rankScore({ item, request, now, pinned, domainMatch }),
        };
      })
      .sort((a, b) => b.score - a.score);

    const budget = maxTokens;
    // Budget-aware include: keep the top items until the token budget is full.
    const relevant: ContextItem[] = [];
    let used = estimateTokens(projectSummary);
    const artifactTypes = new Set(request.artifactTypes ?? []);
    for (const { item, score } of ranked) {
      if (artifactTypes.size > 0 && !artifactTypes.has(String(item.source.kind))) continue;
      const itemTokens = estimateTokens(item.title + (item.summary ?? ''));
      if (used + itemTokens > budget) break;
      relevant.push({ ...item, score });
      used += itemTokens;
    }

    // Semantic/evidence retrieval — lexical retrieval for long text, plus
    // canonical items flagged as research/evidence.
    const evidence: ContextEvidence[] = [];
    if (request.evidenceRequired) {
      evidence.push(...this.lexicalRetrieve(knowledgeItems, canonicalItems, request));
    }

    // Dependency-aware retrieval (Phase 4): only when the request asks for it.
    let depNeighbors: DependencyNeighbor[] = [] as DependencyNeighbor[];
    if (request.includeDirectDependencies || request.includeDependents) {
      const pinned: string[] = request.artifactIds ?? [];
      const startIds: string[] = pinned.length > 0
        ? pinned
        : relevant.map((i) => i.source.externalId);
      const direction: 'upstream' | 'downstream' | 'both' = request.includeDependents === true
        ? 'upstream'
        : request.includeDirectDependencies === true
          ? 'downstream'
          : 'both';
      depNeighbors = await this.dependencyResolver.resolve(
        request.projectId,
        startIds,
        {
          direction,
          maxDepth: request.dependencyMaxDepth ?? 2,
          dependencyTypes: request.requiredRelationships ?? undefined,
          strictOnly: request.dependencyStrict ?? false,
        },
      );
    }

    // Split out the special layers the package must expose.
    const decisions = relevant.filter((i) => i.source.kind === 'architecture_decision');
    const assumptions = relevant.filter((i) => i.source.kind === 'assumption');
    const openQuestions = relevant.filter((i) => i.source.kind === 'question');
    const dependencies = relevant.filter((i) => i.dependencyIds && i.dependencyIds.length > 0);
    if (depNeighbors.length > 0) {
      // Budget-aware: keep the strongest relationships first.
      const sorted = depNeighbors.sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));
      const depBudget = Math.max(1, Math.floor(budget * 0.2));
      let depUsed = 0;
      for (const n of sorted) {
        const itemTokens = estimateTokens(n.artifactId + (n.artifactType ?? ''));
        if (depUsed + itemTokens > depBudget) break;
        dependencies.push({
          source: {
            sourceKind: 'artifact',
            externalId: n.artifactId,
            kind: n.artifactType,
            version: undefined,
          },
          title: n.artifactTitle ?? n.artifactId,
          summary: `relationship: ${n.relation} (depth ${n.depth})`,
          confidence: n.confidence != null ? Math.round(n.confidence * 100) : undefined,
          dependencyIds: n.pathIds,
          score: (n.weight ?? 1) / 10,
          tokenEstimate: itemTokens,
        });
        depUsed += itemTokens;
      }
    }

    // If nothing matched, surface a warning (missing context).
    if (relevant.length === 0) {
      warnings.push('No structured context matched the request — package is empty.');
    }

    const tokenEstimate =
      used + evidence.reduce((sum, e) => sum + estimateTokens(e.text), 0) + estimateTokens(JSON.stringify(decisions));

    const pkg: ContextPackage = {
      projectId: request.projectId,
      agentSkill: request.agentSkill,
      taskType: request.taskType,
      projectSummary,
      relevantArtifacts: deduplicate(relevant),
      relevantEvidence: evidence.slice(0, 8),
      dependencies: deduplicate(dependencies),
      decisions: deduplicate(decisions),
      assumptions: deduplicate(assumptions),
      openQuestions: deduplicate(openQuestions),
      tokenEstimate,
      sourceReferences: sources,
      generatedAt: new Date().toISOString(),
      cached: false,
      cacheKey: key,
      warnings,
    };

    this.cache.put(key, { package: pkg, sourceFingerprint: fingerprint });
    this.logger.debug(
      `Context compiled for ${request.agentSkill} in ${Date.now() - start}ms (${relevant.length} items, ${tokenEstimate} tokens)`,
    );
    return pkg;
  }

  /** Invalidate cache entries that reference a specific source. */
  invalidateForSource(predicate: (ref: ContextSourceRef) => boolean): number {
    return this.cache.invalidate(predicate);
  }

  // ---------------------------------------------------------------------------
  // Retrieval internals
  // ---------------------------------------------------------------------------

  private async collectSources(request: ContextRequest): Promise<ContextSourceRef[]> {
    const refs: ContextSourceRef[] = [];
    const canonicalItems = await this.canonicalRepo.find({
      where: { projectId: request.projectId },
    });
    const knowledgeItems = await this.kiRepo.find({
      where: { projectId: request.projectId },
    });
    for (const c of canonicalItems) {
      refs.push({
        projectId: request.projectId,
        sourceKind: 'canonical',
        externalId: c.externalId,
        kind: c.kind,
        producer: c.createdBy ?? undefined,
        version: c.version,
      });
    }
    for (const k of knowledgeItems) {
      refs.push({
        projectId: request.projectId,
        sourceKind: 'knowledge_item',
        externalId: k.id,
        kind: k.type,
        producer: k.source ?? undefined,
        version: k.version,
      });
    }
    return refs;
  }

  private async projectSummary(projectId: string): Promise<string> {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) return '';
    const idea = project.idea ?? '';
    const brief = idea.replace(/\s+/g, ' ').trim().slice(0, 800);
    return `Project: ${project.name} (${project.status})\n${brief}`;
  }

  private canonicalToContextItem(item: CanonicalItem): ContextItem {
    const body = item.payload as Record<string, unknown>;
    const confidence = item.confidence ?? undefined;
    const provenance = (item.provenance as {
      sources?: Array<{ category: string; refId?: string; label?: string }>;
    })?.sources;
    const dependencyIds =
      Array.isArray(body.dependencies) ? (body.dependencies as string[]) : undefined;
    return {
      source: {
        projectId: item.projectId,
        sourceKind: 'canonical',
        externalId: item.externalId,
        kind: item.kind,
        producer: item.createdBy ?? undefined,
        version: item.version,
      },
      title: item.title,
      summary: item.summary ?? undefined,
      body,
      confidence,
      epistemicClass: (item.provenance as { epistemicClass?: string })?.epistemicClass,
      provenance,
      dependencyIds,
      score: 0,
      tokenEstimate: estimateTokens(item.title + (item.summary ?? '')),
    };
  }

  private knowledgeToContextItem(item: KnowledgeItem): ContextItem {
    const body: Record<string, unknown> = {
      externalId: item.externalId ?? undefined,
      description: item.description ?? undefined,
    };
    let confidence: number | undefined;
    let provenance: Array<{ category: string; refId?: string; label?: string }> | undefined;
    try {
      const meta = item.metadata ? JSON.parse(item.metadata) : undefined;
      if (meta?.confidence !== undefined) confidence = Number(meta.confidence);
      if (Array.isArray(meta?.provenance)) provenance = meta.provenance;
    } catch {
      // ignore malformed metadata
    }
    return {
      source: {
        projectId: item.projectId,
        sourceKind: 'knowledge_item',
        externalId: item.id,
        kind: item.type,
        producer: item.source ?? undefined,
        version: item.version,
      },
      title: item.title,
      summary: item.description ?? undefined,
      body,
      confidence,
      provenance,
      dependencyIds: item.relatedIds.length > 0 ? item.relatedIds : undefined,
      score: 0,
      tokenEstimate: estimateTokens(item.title + (item.description ?? '')),
    };
  }

  /**
   * Lexical retrieval over unstructured knowledge (long descriptions, research
   * text, evidence). Token-overlap scoring — intentionally dependency-free;
   * a vector retriever can replace `scoreText` later without changing the API.
   */
  private lexicalRetrieve(
    knowledgeItems: KnowledgeItem[],
    canonicalItems: CanonicalItem[],
    request: ContextRequest,
  ): ContextEvidence[] {
    const queryTerms = tokenize(
      [request.agentSkill, request.taskType, ...(request.artifactTypes ?? []), ...(request.domains ?? [])].join(' '),
    );
    if (queryTerms.length === 0) return [];

    const out: ContextEvidence[] = [];
    const now = new Date();
    for (const item of knowledgeItems) {
      const text = `${item.title} ${item.description ?? ''} ${item.externalId ?? ''}`;
      const score = overlapScore(text, queryTerms);
      if (score <= 0) continue;
      if (request.recency && recencyScore(item.updatedAt.toISOString(), now, request.recency) === 0) continue;
      out.push({
        source: {
          projectId: request.projectId,
          sourceKind: 'knowledge_item',
          externalId: item.id,
          kind: item.type,
          producer: item.source ?? undefined,
          version: item.version,
        },
        text: truncateToTokens(text, 600).text,
        score,
      });
    }
    for (const item of canonicalItems) {
      if (item.kind !== 'domain_knowledge' && item.kind !== 'project') continue;
      const text = `${item.title} ${item.summary ?? ''} ${JSON.stringify(item.payload ?? {})}`;
      const score = overlapScore(text, queryTerms);
      if (score <= 0) continue;
      out.push({
        source: {
          projectId: request.projectId,
          sourceKind: 'canonical',
          externalId: item.externalId,
          kind: item.kind,
          producer: item.createdBy ?? undefined,
          version: item.version,
        },
        text: truncateToTokens(text, 600).text,
        score,
      });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 12);
  }
}

const noopResolver: DependencyResolver = {
  async resolve() {
    return [];
  },
};

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9_]+/g) ?? []).filter((t) => t.length > 1);
}

function overlapScore(text: string, terms: string[]): number {
  const tokens = new Set(tokenize(text));
  if (tokens.size === 0) return 0;
  let hits = 0;
  for (const term of terms) {
    if (tokens.has(term)) hits += 1;
  }
  return hits / Math.max(1, terms.length);
}
