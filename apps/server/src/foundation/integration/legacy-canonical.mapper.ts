/**
 * Legacy → canonical mapper (pipeline integration).
 *
 * Best-effort translation of legacy `knowledge_items` (NewKnowledgeItem)
 * into canonical artifact payloads. Only knowledge types with a clean
 * canonical mapping are translated; everything else is skipped by the
 * caller (invalid output is never trusted as canonical data).
 */
import type { CanonicalKind } from '../canonical/canonical.types';
import type { NewKnowledgeItem } from '../../agents/types';

export interface CanonicalCandidate {
  kind: CanonicalKind;
  externalId: string;
  title: string;
  summary?: string;
  body: Record<string, unknown>;
  epistemicClass: 'FACT' | 'INFERENCE' | 'ASSUMPTION' | 'USER_DECISION';
  sources: Array<{ category: string; refId?: string; label?: string }>;
  confidence?: number;
}

function conf(item: NewKnowledgeItem): number | undefined {
  return typeof item.confidence === 'number' ? item.confidence : undefined;
}

/**
 * Map a legacy `sourceCategory` onto the canonical source taxonomy
 * (`uploaded_document | user_input | research | interview | artifact |
 * user_decision | ai_inference | ai_assumption`). Anything unrecognized
 * becomes `ai_inference` so the canonical schema validation never rejects
 * the candidate for its provenance shape.
 */
const LEGACY_TO_CANONICAL_SOURCE: Record<string, CanonicalCandidate['sources'][number]['category']> = {
  prompt: 'user_input',
  document: 'uploaded_document',
  research: 'research',
  user_input: 'user_input',
  ai_analysis: 'ai_inference',
  debate: 'artifact',
};

function provenanceFor(item: NewKnowledgeItem): { epistemicClass: CanonicalCandidate['epistemicClass']; sources: CanonicalCandidate['sources'] } {
  const legacyCategory = item.sourceCategory ?? 'ai_analysis';
  const category = LEGACY_TO_CANONICAL_SOURCE[legacyCategory] ?? 'ai_inference';
  const epistemicClass: CanonicalCandidate['epistemicClass'] =
    category === 'user_input' || category === 'uploaded_document' || category === 'research'
      ? 'FACT'
      : 'INFERENCE';
  const sources: CanonicalCandidate['sources'] = [{ category, refId: item.externalId ?? undefined }];
  return { epistemicClass, sources };
}

function candidate(item: NewKnowledgeItem, kind: CanonicalKind, body: Record<string, unknown>): CanonicalCandidate | null {
  return {
    kind,
    externalId: item.externalId ?? item.title.slice(0, 60),
    title: item.title,
    summary: item.description ?? undefined,
    body,
    ...provenanceFor(item),
    confidence: conf(item),
  };
}

/**
 * Map a legacy knowledge item to a canonical candidate, or null when there
 * is no valid canonical representation.
 */
export function mapKnowledgeItemToCanonical(item: NewKnowledgeItem): CanonicalCandidate | null {
  switch (item.type) {
    case 'FUNCTIONAL_REQUIREMENT':
      return candidate(item, 'requirement', {
        classification: 'functional',
        priority: 'P1',
        actors: [],
        preconditions: [],
        postconditions: [],
        businessRuleRefs: [],
        acceptanceCriteriaRefs: [],
        dependencies: item.relatedIds ?? [],
        sourceRefs: [],
        assumptions: [],
        confidence: { value: item.confidence ?? 75 },
        validationStatus: 'UNVALIDATED',
        description: item.description ?? '',
      });
    case 'NON_FUNCTIONAL_REQUIREMENT':
      return candidate(item, 'non_functional_requirement', {
        classification: 'non_functional',
        priority: 'P1',
        category: 'performance',
        actors: [],
        preconditions: [],
        postconditions: [],
        businessRuleRefs: [],
        acceptanceCriteriaRefs: [],
        dependencies: item.relatedIds ?? [],
        sourceRefs: [],
        assumptions: [],
        confidence: { value: item.confidence ?? 75 },
        validationStatus: 'UNVALIDATED',
        description: item.description ?? '',
      });
    case 'USER_STORY':
      return candidate(item, 'user_story', {
        asA: item.title,
        iWant: item.description ?? '',
        soThat: item.description ?? '',
        requirementRefs: item.relatedIds ?? [],
      });
    case 'BUSINESS_GOAL':
      return candidate(item, 'project_goal', { description: item.description ?? item.title });
    case 'ASSUMPTION':
      return candidate(item, 'assumption', { statement: item.title, impactIfViolated: item.description ?? undefined });
    case 'CONSTRAINT':
      return candidate(item, 'constraint', { statement: item.title, category: 'technical' });
    case 'RISK':
      return candidate(item, 'risk', {
        description: item.description ?? item.title,
        likelihood: 'medium',
        impact: 'medium',
        mitigation: item.evidence ?? undefined,
      });
    case 'BUSINESS_RULE':
      return candidate(item, 'business_rule', { statement: item.title, consequence: item.description ?? undefined });
    case 'ACCEPTANCE_CRITERION':
      return candidate(item, 'acceptance_criterion', {
        given: item.title,
        when: item.description ?? '',
        then: item.description ?? '',
      });
    case 'SCREEN':
      return candidate(item, 'screen', {
        purpose: item.description ?? item.title,
        fields: [],
      });
    case 'TEST_CASE':
      return candidate(item, 'test_case', {
        type: 'integration',
        steps: [],
        expectedResult: item.description ?? '',
      });
    default:
      return null;
  }
}

/** Map a whole knowledge batch; unmappable items are omitted. */
export function mapKnowledgeBatchToCanonical(items: NewKnowledgeItem[]): CanonicalCandidate[] {
  const out: CanonicalCandidate[] = [];
  for (const item of items) {
    const mapped = mapKnowledgeItemToCanonical(item);
    if (mapped) out.push(mapped);
  }
  return out;
}
