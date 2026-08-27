/**
 * The 11 quality checks (Phase 8) — pure functions over EvaluatedArtifact.
 *
 * Each check returns a 0-100 score + issues. The aggregator in
 * `quality.evaluate.ts` weights them and derives the final status.
 */
import { CANONICAL_SCHEMAS } from '../canonical/canonical.schemas';
import type { ConflictFinding } from './quality.conflicts';
import type { EvaluatedArtifact, QualityCheckResult, QualityIssue, QualityStatus } from './quality.types';

export interface CheckContext {
  artifact: EvaluatedArtifact;
  allArtifacts: EvaluatedArtifact[];
  conflicts: ConflictFinding[];
  threshold: number;
  env?: Record<string, string | undefined>;
}

export type QualityCheckFn = (ctx: CheckContext) => QualityCheckResult;

function statusFor(scoreValue: number, threshold: number): QualityStatus {
  if (scoreValue >= threshold) return 'PASS';
  if (scoreValue >= threshold - 10) return 'WARNING';
  if (scoreValue >= threshold - 20) return 'REVIEW_REQUIRED';
  return 'BLOCKED';
}

function issue(check: string, severity: QualityIssue['severity'], message: string): QualityIssue {
  return { check, severity, message };
}

const requiredBodyFields: Record<string, string[]> = {
  requirement: ['classification', 'priority', 'confidence'],
  non_functional_requirement: ['classification', 'priority', 'category', 'confidence'],
  security_requirement: ['classification', 'priority', 'category', 'confidence'],
  user_story: ['asA', 'iWant', 'soThat'],
  acceptance_criterion: ['given', 'when', 'then'],
  entity: ['name'],
  relationship: ['fromEntityRef', 'toEntityRef', 'relation'],
  api: ['method', 'path'],
  test_case: ['type', 'expectedResult'],
  estimate: ['optimisticHours', 'mostLikelyHours', 'pessimisticHours', 'team'],
  risk: ['likelihood', 'impact'],
  business_rule: ['statement'],
  constraint: ['statement', 'category'],
  architecture_decision: ['decision', 'rationale'],
};

// ---------------------------------------------------------------------------

export const checkSchema: QualityCheckFn = (ctx) => {
  const issues: QualityIssue[] = [];
  const schema = CANONICAL_SCHEMAS[ctx.artifact.kind as keyof typeof CANONICAL_SCHEMAS];
  if (!schema) {
    return { key: 'schema', status: 'PASS', score: 100, weight: 0, issues: [] };
  }
  // Validate the stored payload AS-IS. Canonical items were already schema-
  // validated at ingest, and confidence lives at the artifact top level
  // (a separate column) — injecting it into the strict body would produce
  // false "Unrecognized key" violations for every item.
  const input = {
    externalId: ctx.artifact.id,
    kind: ctx.artifact.kind,
    title: ctx.artifact.title,
    summary: ctx.artifact.summary ?? undefined,
    provenance: ctx.artifact.provenance ?? { epistemicClass: 'INFERENCE', sources: [] },
    body: ctx.artifact.body ?? {},
  };
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    for (const e of parsed.error.issues.slice(0, 5)) {
      issues.push(issue('schema', 'critical', `schema violation at ${e.path.join('.')}: ${e.message}`));
    }
  }
  const value = parsed.success ? 100 : Math.max(0, 100 - issues.length * 20);
  return { key: 'schema', status: statusFor(value, 90), score: value, weight: 0, issues };
};

export const checkCompleteness: QualityCheckFn = (ctx) => {
  const issues: QualityIssue[] = [];
  const required = requiredBodyFields[ctx.artifact.kind] ?? [];
  const body = ctx.artifact.body ?? {};
  let present = 0;
  for (const field of required) {
    let raw: unknown = body[field];
    // Confidence is stored at the artifact top level by the canonical model.
    if (field === 'confidence' && raw == null) raw = ctx.artifact.confidence;
    const ok = raw !== undefined && raw !== null && raw !== '' && !(Array.isArray(raw) && raw.length === 0);
    if (ok) present += 1;
    else issues.push(issue('completeness', 'warning', `missing required field '${field}'`));
  }
  const value = required.length === 0 ? 100 : Math.round((present / required.length) * 100);
  return { key: 'completeness', status: statusFor(value, ctx.threshold), score: value, weight: 0, issues };
};

export const checkConsistency: QualityCheckFn = (ctx) => {
  const issues: QualityIssue[] = [];
  const body = ctx.artifact.body ?? {};
  if (ctx.artifact.kind === 'requirement' || ctx.artifact.kind === 'non_functional_requirement') {
    const classification = String(body.classification ?? '');
    const actors = Array.isArray(body.actors) ? body.actors : [];
    if (classification === 'functional' && actors.length === 0) {
      issues.push(issue('consistency', 'warning', 'functional requirement has no actors'));
    }
    if (classification === 'non_functional' && !body.category) {
      issues.push(issue('consistency', 'warning', 'non-functional requirement missing category'));
    }
  }
  const confidence = ctx.artifact.confidence;
  if (confidence != null && (confidence < 0 || confidence > 100)) {
    issues.push(issue('consistency', 'critical', `confidence ${confidence} out of range`));
  }
  // Conflicts from the conflict detector.
  for (const conflict of ctx.conflicts) {
    if (conflict.artifactKeyA === ctx.artifact.id || conflict.artifactKeyB === ctx.artifact.id) {
      issues.push(issue('consistency', 'critical', `conflict on '${conflict.topic}': ${conflict.evidenceA} vs ${conflict.evidenceB}`));
    }
  }
  const value = issues.some((i) => i.severity === 'critical') ? 40 : issues.length === 0 ? 100 : 75;
  return { key: 'consistency', status: statusFor(value, ctx.threshold), score: value, weight: 0, issues };
};

export const checkTraceability: QualityCheckFn = (ctx) => {
  const issues: QualityIssue[] = [];
  const provenance = ctx.artifact.provenance;
  if (!provenance || !provenance.epistemicClass) {
    issues.push(issue('traceability', 'critical', 'missing provenance epistemicClass'));
  }
  const sources = provenance?.sources ?? [];
  if (provenance?.epistemicClass === 'FACT' && sources.length === 0) {
    issues.push(issue('traceability', 'critical', 'FACT artifact without source references'));
  }
  const value = issues.length === 0 ? 100 : issues.some((i) => i.severity === 'critical') ? 40 : 70;
  return { key: 'traceability', status: statusFor(value, ctx.threshold), score: value, weight: 0, issues };
};

export const checkDependencyIntegrity: QualityCheckFn = (ctx) => {
  const issues: QualityIssue[] = [];
  const known = new Set(ctx.allArtifacts.map((a) => a.id));
  const refs = [
    ...(ctx.artifact.relatedIds ?? []),
    ...(Array.isArray(ctx.artifact.body?.dependencies) ? (ctx.artifact.body?.dependencies as string[]) : []),
    ...(Array.isArray(ctx.artifact.body?.businessRuleRefs) ? (ctx.artifact.body?.businessRuleRefs as string[]) : []),
    ...(Array.isArray(ctx.artifact.body?.acceptanceCriteriaRefs) ? (ctx.artifact.body?.acceptanceCriteriaRefs as string[]) : []),
    ...(Array.isArray(ctx.artifact.body?.requirementRefs) ? (ctx.artifact.body?.requirementRefs as string[]) : []),
  ];
  let dangling = 0;
  for (const ref of refs) {
    if (!known.has(ref)) {
      dangling += 1;
      issues.push(issue('dependency_integrity', 'warning', `dangling reference '${ref}'`));
    }
  }
  const value = refs.length === 0 ? 100 : Math.max(0, 100 - Math.round((dangling / refs.length) * 100));
  return { key: 'dependency_integrity', status: statusFor(value, ctx.threshold), score: value, weight: 0, issues };
};

export const checkConfidence: QualityCheckFn = (ctx) => {
  const issues: QualityIssue[] = [];
  const confidence = ctx.artifact.confidence;
  if (confidence == null) {
    issues.push(issue('confidence', 'warning', 'no confidence score'));
    return { key: 'confidence', status: 'WARNING', score: 60, weight: 0, issues };
  }
  if (confidence < 50) {
    issues.push(issue('confidence', 'warning', `low confidence (${confidence})`));
  }
  if (ctx.artifact.provenance?.epistemicClass === 'ASSUMPTION' && confidence >= 90) {
    issues.push(issue('confidence', 'warning', 'ASSUMPTION carries suspiciously high confidence'));
  }
  const value = confidence;
  return { key: 'confidence', status: statusFor(value, ctx.threshold), score: value, weight: 0, issues };
};

export const checkTestability: QualityCheckFn = (ctx) => {
  const issues: QualityIssue[] = [];
  const body = ctx.artifact.body ?? {};
  if (ctx.artifact.kind === 'requirement') {
    const ac = Array.isArray(body.acceptanceCriteria) ? body.acceptanceCriteria : [];
    if (ac.length === 0) {
      issues.push(issue('testability', 'warning', 'requirement has no acceptance criteria'));
    }
    const hasTests = ctx.allArtifacts.some((a) => a.kind === 'test_case' && Array.isArray(a.body?.requirementRefs) && (a.body?.requirementRefs as string[]).includes(ctx.artifact.id));
    if (!hasTests) {
      issues.push(issue('testability', 'warning', 'no test case covers this requirement'));
    }
  }
  const value = issues.length === 0 ? 100 : issues.some((i) => i.severity === 'critical') ? 40 : 75;
  return { key: 'testability', status: statusFor(value, ctx.threshold), score: value, weight: 0, issues };
};

export const checkRequirementQuality: QualityCheckFn = (ctx) => {
  const issues: QualityIssue[] = [];
  const body = ctx.artifact.body ?? {};
  if (!['requirement', 'non_functional_requirement', 'security_requirement'].includes(ctx.artifact.kind)) {
    return { key: 'requirement_quality', status: 'PASS', score: 100, weight: 0, issues: [] };
  }
  if (!body.priority) issues.push(issue('requirement_quality', 'warning', 'missing priority'));
  if (!body.classification) issues.push(issue('requirement_quality', 'warning', 'missing classification'));
  const desc = (ctx.artifact.summary ?? '').length + (typeof body.description === 'string' ? body.description.length : 0);
  if (desc < 60) issues.push(issue('requirement_quality', 'warning', 'requirement is under-specified (short description)'));
  const value = issues.length === 0 ? 100 : issues.length === 1 ? 80 : 65;
  return { key: 'requirement_quality', status: statusFor(value, ctx.threshold), score: value, weight: 0, issues };
};

export const checkSourceSupport: QualityCheckFn = (ctx) => {
  const issues: QualityIssue[] = [];
  const sources = ctx.artifact.provenance?.sources ?? [];
  const cls = ctx.artifact.provenance?.epistemicClass;
  if (cls === 'FACT' && sources.length === 0) {
    issues.push(issue('source_support', 'critical', 'FACT without supporting sources'));
  }
  if ((cls === 'INFERENCE' || cls === 'FACT') && sources.length === 0) {
    issues.push(issue('source_support', 'warning', 'claim without source references'));
  }
  const value = issues.some((i) => i.severity === 'critical') ? 40 : issues.length === 0 ? 100 : 70;
  return { key: 'source_support', status: statusFor(value, ctx.threshold), score: value, weight: 0, issues };
};

export const checkHallucinationRisk: QualityCheckFn = (ctx) => {
  const issues: QualityIssue[] = [];
  const known = new Set(ctx.allArtifacts.map((a) => a.id));
  const text = `${ctx.artifact.title} ${ctx.artifact.summary ?? ''} ${ctx.artifact.body ? JSON.stringify(ctx.artifact.body) : ''}`;
  // Invented ID pattern: known prefixes followed by digits, not in the project.
  const idPattern = /(?:FR|NFR|US|AC|TBL|API|SEC|TP|TC|CMP|VAL|ASM|BR|FEAT|MOD)-?\d{2,}/g;
  const matches = text.match(idPattern) ?? [];
  const invented = [...new Set(matches)].filter((m) => !known.has(m));
  for (const id of invented) {
    issues.push(issue('hallucination_risk', 'warning', `references unknown id '${id}'`));
  }
  const value = invented.length === 0 ? 100 : Math.max(0, 100 - invented.length * 15);
  return { key: 'hallucination_risk', status: statusFor(value, ctx.threshold), score: value, weight: 0, issues };
};

export const checkCoverage: QualityCheckFn = (ctx) => {
  const issues: QualityIssue[] = [];
  const kindsPresent = new Set(ctx.allArtifacts.map((a) => a.kind));
  const required = ['requirement', 'user_story', 'test_case', 'entity', 'api'];
  const missing = required.filter((k) => !kindsPresent.has(k));
  for (const kind of missing) {
    issues.push(issue('coverage', 'info', `no artifacts of kind '${kind}' in project`));
  }
  const value = Math.round(((required.length - missing.length) / required.length) * 100);
  return { key: 'coverage', status: statusFor(value, 80), score: value, weight: 0, issues };
};

export const ALL_QUALITY_CHECKS: Record<string, QualityCheckFn> = {
  schema: checkSchema,
  completeness: checkCompleteness,
  consistency: checkConsistency,
  traceability: checkTraceability,
  dependency_integrity: checkDependencyIntegrity,
  confidence: checkConfidence,
  testability: checkTestability,
  requirement_quality: checkRequirementQuality,
  source_support: checkSourceSupport,
  hallucination_risk: checkHallucinationRisk,
  coverage: checkCoverage,
};
