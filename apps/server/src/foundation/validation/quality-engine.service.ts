import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { QualityCheck, KnowledgeItem } from '../../database/entities';
import { CanonicalItem } from '../canonical/canonical-item.entity';
import { evaluateArtifact, evaluateProject, QUALITY_EVALUATOR_VERSION } from './quality.evaluate';
import { DEFAULT_QUALITY_THRESHOLDS, DEFAULT_CHECK_WEIGHTS, QUALITY_CHECK_KEYS, resolveThreshold } from './quality.thresholds';
import type { EvaluatedArtifact, ProjectEvaluationResult, QualityResult } from './quality.types';
import type { EvaluateOptions } from './quality.evaluate';

/**
 * QualityEngineService (Phase 8) — centralized validation & quality decisions.
 *
 * The validation pipeline for every AI-generated artifact:
 *   schema → normalization → business → provenance → consistency →
 *   dependency → quality evaluation → quality gate → status → persistence.
 *
 * Artifacts are NEVER trusted project data without passing this pipeline.
 * The legacy `QualityGateService` (knowledge-coverage etc.) remains available;
 * the new engine is opt-in.
 */
@Injectable()
export class QualityEngineService {
  private readonly logger = new Logger(QualityEngineService.name);

  constructor(
    @InjectRepository(QualityCheck)
    private readonly checkRepo: Repository<QualityCheck>,
    @InjectRepository(CanonicalItem)
    private readonly canonicalRepo: Repository<CanonicalItem>,
    @InjectRepository(KnowledgeItem)
    private readonly kiRepo: Repository<KnowledgeItem>,
  ) {}

  /** Evaluate a single artifact (already loaded) and persist the gate result. */
  async evaluateArtifactAndPersist(input: {
    projectId: string;
    artifact: EvaluatedArtifact;
    allArtifacts?: EvaluatedArtifact[];
    workflowExecutionId?: string;
    options?: EvaluateOptions;
  }): Promise<QualityResult> {
    const allArtifacts = input.allArtifacts ?? [input.artifact];
    const result = evaluateArtifact({
      artifact: input.artifact,
      allArtifacts,
      options: input.options,
    });
    await this.persist({
      projectId: input.projectId,
      workflowExecutionId: input.workflowExecutionId,
      artifactId: input.artifact.id,
      gateKey: `engine:${input.artifact.kind}`,
      result,
    });
    return result;
  }

  /** Load all canonical + legacy artifacts and evaluate the whole project. */
  async evaluateProject(projectId: string, options?: EvaluateOptions): Promise<ProjectEvaluationResult> {
    const [canonical, knowledge] = await Promise.all([
      this.canonicalRepo.find({ where: { projectId } }),
      this.kiRepo.find({ where: { projectId } }),
    ]);
    const artifacts: EvaluatedArtifact[] = [
      ...canonical.map(toEvaluatedCanonical),
      ...knowledge.map(toEvaluatedKnowledge),
    ];
    const evaluation = evaluateProject(projectId, artifacts, options);
    await this.persistProjectSummary(projectId, evaluation);
    return evaluation;
  }

  /** Resolve the effective thresholds + weights for inspection/UI. */
  thresholds(env?: Record<string, string | undefined>) {
    return {
      defaults: DEFAULT_QUALITY_THRESHOLDS,
      weights: DEFAULT_CHECK_WEIGHTS,
      checkKeys: QUALITY_CHECK_KEYS,
      evaluatorVersion: QUALITY_EVALUATOR_VERSION,
      resolvedFor: (kind: string) => resolveThreshold(kind, env),
    };
  }

  listChecks(projectId: string, limit = 100): Promise<QualityCheck[]> {
    return this.checkRepo.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async persist(input: {
    projectId: string;
    workflowExecutionId?: string;
    artifactId?: string;
    gateKey: string;
    result: QualityResult;
  }): Promise<QualityCheck> {
    const row = this.checkRepo.create({
      id: randomUUID(),
      projectId: input.projectId,
      workflowExecutionId: input.workflowExecutionId ?? null,
      artifactId: input.artifactId ?? null,
      gateKey: input.gateKey,
      status: input.result.status,
      score: input.result.score,
      findings: JSON.stringify(input.result.issues),
      checkedAt: new Date(),
      metadata: JSON.stringify({
        checks: input.result.checks.map((c) => ({ key: c.key, status: c.status, score: c.score })),
        blockingIssues: input.result.blockingIssues,
        recommendations: input.result.recommendations,
        evaluatorVersion: input.result.evaluatorVersion,
      }),
    });
    return this.checkRepo.save(row);
  }

  private async persistProjectSummary(
    projectId: string,
    evaluation: ProjectEvaluationResult,
  ): Promise<void> {
    await this.persist({
      projectId,
      gateKey: 'engine:project',
      result: {
        status: evaluation.summary.blocked > 0 ? 'BLOCKED' : evaluation.summary.reviewRequired > 0 ? 'REVIEW_REQUIRED' : evaluation.summary.warnings > 0 ? 'WARNING' : 'PASS',
        score: evaluation.summary.averageScore,
        checks: [],
        issues: [],
        warnings: [],
        blockingIssues: [],
        recommendations: [],
        evaluatedAt: new Date().toISOString(),
        evaluatorVersion: QUALITY_EVALUATOR_VERSION,
      },
    });
  }
}

function toEvaluatedCanonical(item: CanonicalItem): EvaluatedArtifact {
  return {
    id: item.externalId,
    kind: item.kind,
    title: item.title,
    summary: item.summary,
    body: item.payload,
    confidence: item.confidence,
    provenance: (item.provenance as EvaluatedArtifact['provenance']) ?? null,
    status: item.status,
    relatedIds: Array.isArray((item.payload as { dependencies?: unknown })?.dependencies)
      ? ((item.payload as { dependencies: string[] }).dependencies)
      : [],
  };
}

/** Map a legacy sourceCategory onto the canonical source taxonomy. */
const LEGACY_SOURCE_CATEGORY_TO_CANONICAL: Record<string, string> = {
  prompt: 'user_input',
  document: 'uploaded_document',
  research: 'research',
  user_input: 'user_input',
  ai_analysis: 'ai_inference',
  debate: 'artifact',
};

/** Derive an epistemic class from the legacy source category. */
function epistemicClassFor(category: string | undefined): 'FACT' | 'INFERENCE' {
  return category === 'user_input' || category === 'uploaded_document' || category === 'research'
    ? 'FACT'
    : 'INFERENCE';
}

function toEvaluatedKnowledge(item: KnowledgeItem): EvaluatedArtifact {
  const metadata = parseMetadata(item.metadata);
  const legacyCategory = typeof metadata?.sourceCategory === 'string' ? metadata.sourceCategory : undefined;
  const category = legacyCategory
    ? (LEGACY_SOURCE_CATEGORY_TO_CANONICAL[legacyCategory] ?? 'ai_inference')
    : 'ai_inference';
  const source = item.source ?? item.createdBy ?? undefined;
  return {
    id: item.externalId ?? item.id,
    kind: item.type,
    title: item.title,
    summary: item.description,
    body: { description: item.description, externalId: item.externalId },
    confidence: typeof metadata?.confidence === 'number' ? metadata.confidence : null,
    provenance: {
      epistemicClass: epistemicClassFor(category),
      sources: [{ category, refId: source }],
    },
    status: item.status,
    relatedIds: item.relatedIds,
  };
}

function parseMetadata(metadata: string | null): Record<string, unknown> | null {
  if (!metadata) return null;
  try {
    return JSON.parse(metadata) as Record<string, unknown>;
  } catch {
    return null;
  }
}

