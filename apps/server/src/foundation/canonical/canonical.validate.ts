/**
 * Business validation — the third stage of the canonical ingestion pipeline.
 *
 * Runs after Zod schema validation and normalization. Catches issues that
 * are syntactically valid but semantically wrong (e.g. a requirement that
 * references a non-existent acceptance criterion, an ASSUMPTION object with
 * high confidence, an empty sourceRefs on a FACT).
 *
 * Returns a list of issues, never throws; the service layer decides whether
 * to fail or repair.
 */
import type { CanonicalLlmInput } from './canonical.schemas';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface BusinessIssue {
  code: string;
  severity: Severity;
  field?: string;
  message: string;
}

export interface BusinessValidationResult {
  issues: BusinessIssue[];
}

const REQUIREMENT_BODY = new Set([
  'requirement',
  'non_functional_requirement',
  'security_requirement',
]);

export function validateBusinessRules(input: CanonicalLlmInput): BusinessValidationResult {
  const issues: BusinessIssue[] = [];

  if (input.provenance.epistemicClass === 'FACT' && input.provenance.sources.length === 0) {
    issues.push({
      code: 'FACT_WITHOUT_SOURCE',
      severity: 'critical',
      field: 'provenance.sources',
      message: "FACT objects must include at least one source reference.",
    });
  }

  if (
    (input.provenance.epistemicClass === 'INFERENCE' ||
      input.provenance.epistemicClass === 'ASSUMPTION') &&
    input.provenance.sources.length === 0
  ) {
    issues.push({
      code: 'INFERENCE_OR_ASSUMPTION_WITHOUT_SOURCE',
      severity: 'high',
      field: 'provenance.sources',
      message:
        'INFERENCE/ASSUMPTION objects should reference at least one upstream source.',
    });
  }

  // Requirement-specific checks.
  if (REQUIREMENT_BODY.has(input.kind)) {
    const body = input.body as {
      classification?: string;
      confidence?: { value?: number };
      sourceRefs?: unknown[];
      actors?: unknown[];
    };
    if (body.classification === 'functional' && body.actors?.length === 0) {
      issues.push({
        code: 'FUNCTIONAL_REQ_NEEDS_ACTOR',
        severity: 'medium',
        field: 'body.actors',
        message: 'Functional requirements should reference at least one actor.',
      });
    }
    const conf = body.confidence?.value ?? 100;
    if (input.provenance.epistemicClass === 'ASSUMPTION' && conf >= 90) {
      issues.push({
        code: 'ASSUMPTION_HIGH_CONFIDENCE',
        severity: 'high',
        field: 'body.confidence.value',
        message:
          'ASSUMPTION objects should not carry high confidence — lower the value or upgrade to INFERENCE/FACT.',
      });
    }
  }

  // Story must reference an actor via `actorRef` (or have it in the body).
  if (input.kind === 'user_story') {
    const body = input.body as { asA?: string; actorRef?: string };
    if (!body.actorRef && body.asA && body.asA.length < 2) {
      issues.push({
        code: 'USER_STORY_AS_A_SHORT',
        severity: 'low',
        field: 'body.asA',
        message: 'UserStory.asA looks suspiciously short.',
      });
    }
  }

  // Relationship: from != to.
  if (input.kind === 'relationship') {
    const body = input.body as { fromEntityRef?: string; toEntityRef?: string };
    if (body.fromEntityRef && body.fromEntityRef === body.toEntityRef) {
      issues.push({
        code: 'RELATIONSHIP_SELF',
        severity: 'medium',
        field: 'body.fromEntityRef',
        message: 'Relationships cannot reference the same entity on both ends.',
      });
    }
  }

  // Risk must carry likelihood and impact — already enforced by Zod; here
  // we surface when both are high so the consumer can flag it.
  if (input.kind === 'risk') {
    const body = input.body as { likelihood?: string; impact?: string };
    if (body.likelihood === 'high' && body.impact === 'high') {
      issues.push({
        code: 'RISK_CRITICAL',
        severity: 'medium',
        field: 'body',
        message: 'Risk has high likelihood and high impact — escalate to scope review.',
      });
    }
  }

  return { issues };
}

/** Helper: returns true when the issues block persistence. */
export function isBlocking(issues: BusinessIssue[]): boolean {
  return issues.some((i) => i.severity === 'critical' || i.severity === 'high');
}
