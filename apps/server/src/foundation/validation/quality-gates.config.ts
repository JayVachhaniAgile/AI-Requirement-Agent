/**
 * Declarative quality gate registry (new architecture).
 *
 * Mirrors the pattern used by `workflow/pipeline.config.ts`: a single source
 * of truth, consumed by `QualityGateService` and testable in isolation.
 */

export type QualitySeverity = 'critical' | 'high' | 'medium' | 'low';

export interface QualityGateDefinition {
  key: string;
  name: string;
  description: string;
  /** When true the gate is advisory (report-only) instead of blocking. */
  advisory: boolean;
  defaultSeverity: QualitySeverity;
}

/** Keys of the built-in gates understood by the quality gate runner. */
export const QUALITY_GATES: Record<string, QualityGateDefinition> = {
  'knowledge-coverage': {
    key: 'knowledge-coverage',
    name: 'Knowledge coverage',
    description:
      'Ensures the project knowledge base contains at least the minimum number of items expected for a usable pipeline run.',
    advisory: true,
    defaultSeverity: 'medium',
  },
  'id-integrity': {
    key: 'id-integrity',
    name: 'ID integrity',
    description:
      'Detects dangling cross-references between knowledge items (relatedIds pointing at missing items).',
    advisory: false,
    defaultSeverity: 'high',
  },
  'artifact-presence': {
    key: 'artifact-presence',
    name: 'Artifact presence',
    description:
      'Ensures the required artifact types exist for a project (e.g. compiled document).',
    advisory: false,
    defaultSeverity: 'high',
  },
};

export interface KnowledgeItemRef {
  id?: string;
  externalId: string | null;
  type: string;
  title: string;
  description?: string | null;
  status?: string | null;
  source?: string | null;
  relatedIds?: string[];
}

export interface CoverageResult {
  gateKey: string;
  status: 'PASS' | 'FAIL';
  score: number;
  findings: Array<{ severity: QualitySeverity; message: string }>;
}

/** 0-100 coverage scored from the ratio of expected → actual knowledge items. */
export function evaluateCoverage(
  items: KnowledgeItemRef[],
  options: { minItems?: number; requiredTypes?: string[] } = {},
): CoverageResult {
  const minItems = options.minItems ?? 5;
  const findings: Array<{ severity: QualitySeverity; message: string }> = [];

  if (items.length < minItems) {
    findings.push({
      severity: 'medium',
      message: `Knowledge base has ${items.length} items (minimum ${minItems} expected).`,
    });
  }

  const requiredTypes = options.requiredTypes ?? [];
  for (const type of requiredTypes) {
    const count = items.filter((item) => item.type === type).length;
    if (count === 0) {
      findings.push({
        severity: 'medium',
        message: `No knowledge item of type '${type}' present.`,
      });
    }
  }

  const score = Math.min(100, Math.round((items.length / Math.max(1, minItems)) * 100));
  return {
    gateKey: 'knowledge-coverage',
    status: findings.length === 0 ? 'PASS' : 'FAIL',
    score,
    findings,
  };
}

export interface IdIntegrityResult {
  gateKey: string;
  status: 'PASS' | 'FAIL';
  score: number;
  findings: Array<{ severity: QualitySeverity; message: string }>;
}

/** Dangles = relatedIds that reference an externalId that does not exist. */
export function evaluateIdIntegrity(items: KnowledgeItemRef[]): IdIntegrityResult {
  const ids = new Set(items.map((item) => item.externalId).filter((id): id is string => !!id));
  const findings: Array<{ severity: QualitySeverity; message: string }> = [];
  let danglingCount = 0;

  for (const item of items) {
    for (const ref of item.relatedIds ?? []) {
      if (!ids.has(ref)) {
        danglingCount += 1;
        findings.push({
          severity: 'high',
          message: `Item '${item.externalId ?? item.title}' references missing id '${ref}'.`,
        });
      }
    }
  }

  const total = items.reduce((sum, item) => sum + (item.relatedIds?.length ?? 0), 0);
  const score = total === 0 ? 100 : Math.round(((total - danglingCount) / total) * 100);
  return {
    gateKey: 'id-integrity',
    status: findings.length === 0 ? 'PASS' : 'FAIL',
    score: Math.max(0, score),
    findings,
  };
}

export interface ArtifactPresenceResult {
  gateKey: string;
  status: 'PASS' | 'FAIL';
  score: number;
  findings: Array<{ severity: QualitySeverity; message: string }>;
}

export function evaluateArtifactPresence(
  presentTypes: string[],
  requiredTypes: string[],
): ArtifactPresenceResult {
  const present = new Set(presentTypes);
  const missing = requiredTypes.filter((type) => !present.has(type));
  const findings = missing.map((type) => ({
    severity: 'high' as const,
    message: `Required artifact type '${type}' is missing.`,
  }));
  const score = Math.round(((requiredTypes.length - missing.length) / requiredTypes.length) * 100);
  return {
    gateKey: 'artifact-presence',
    status: missing.length === 0 ? 'PASS' : 'FAIL',
    score,
    findings,
  };
}
