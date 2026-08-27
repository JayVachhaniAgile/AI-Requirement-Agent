/**
 * Pure ranking + scoring for context items.
 *
 * Score components (all 0-1):
 *  - taskTypeWeight: hard-coded per kind × task table (see below)
 *  - confidence:     item confidence (0-1, default 0.5 when missing)
 *  - recency:        1 / (1 + daysSinceUpdate/30) — decays slowly
 *  - dependencyBoost: 1.0 when item is pinned via artifactIds, else 0.5
 *  - domainBoost:    1.0 when item domain ∈ request.domains, else 0.5
 */
import type {
  ContextItem,
  ContextRequest,
  ContextSourceRef,
  ContextTaskType,
} from './context.types';

const KIND_TASK_WEIGHTS: Partial<Record<ContextTaskType, Record<string, number>>> = {
  requirements: {
    requirement: 1.0,
    non_functional_requirement: 1.0,
    security_requirement: 0.9,
    actor: 0.9,
    business_rule: 0.85,
    assumption: 0.7,
    risk: 0.7,
    constraint: 0.7,
    user_story: 0.95,
    acceptance_criterion: 0.95,
    project_goal: 0.9,
    scope_item: 0.6,
  },
  ux: {
    screen: 1.0,
    user_story: 0.95,
    actor: 0.9,
    acceptance_criterion: 0.85,
    requirement: 0.8,
    project_goal: 0.7,
  },
  database: {
    entity: 1.0,
    relationship: 1.0,
    api: 0.7,
    requirement: 0.8,
    non_functional_requirement: 0.85,
  },
  security: {
    security_requirement: 1.0,
    risk: 0.95,
    requirement: 0.8,
    constraint: 0.85,
    architecture_decision: 0.8,
  },
  architecture: {
    architecture_decision: 1.0,
    api: 0.95,
    entity: 0.85,
    relationship: 0.8,
    constraint: 0.8,
    non_functional_requirement: 0.85,
    screen: 0.6,
  },
  estimation: {
    requirement: 0.9,
    user_story: 0.85,
    scope_item: 1.0,
    estimate: 0.95,
    risk: 0.7,
  },
  testing: {
    test_case: 1.0,
    requirement: 0.9,
    acceptance_criterion: 0.95,
    user_story: 0.8,
  },
  document: {
    requirement: 0.9,
    business_rule: 0.8,
    scope_item: 0.85,
    project_goal: 0.8,
    estimate: 0.85,
  },
  research: {
    domain_knowledge: 1.0,
    project_goal: 0.8,
    constraint: 0.7,
  },
  compilation: {
    requirement: 0.9,
    user_story: 0.85,
    architecture_decision: 0.85,
    estimate: 0.8,
    scope_item: 0.8,
  },
  gap_analysis: {
    requirement: 0.85,
    acceptance_criterion: 0.85,
    test_case: 0.85,
    user_story: 0.7,
    scope_item: 0.85,
  },
  discovery: {
    project: 1.0,
    project_goal: 1.0,
    actor: 0.95,
    assumption: 0.85,
    question: 0.95,
    constraint: 0.8,
    risk: 0.8,
  },
  validation: {
    requirement: 0.9,
    business_rule: 0.85,
    risk: 0.85,
    architecture_decision: 0.85,
    scope_item: 0.8,
  },
};

export function taskTypeWeight(taskType: ContextTaskType, kind: string): number {
  const map = KIND_TASK_WEIGHTS[taskType];
  if (!map) return 0.5;
  return map[kind] ?? 0.5;
}

export function recencyScore(updatedAt: string, now: Date, recencyDays?: number): number {
  const ageMs = now.getTime() - new Date(updatedAt).getTime();
  if (Number.isNaN(ageMs)) return 0.5;
  const days = ageMs / (1000 * 60 * 60 * 24);
  if (recencyDays && days > recencyDays) return 0;
  return 1 / (1 + days / 30);
}

export interface RankedScoreInput {
  item: ContextItem;
  request: ContextRequest;
  now: Date;
  pinned: boolean;
  domainMatch: boolean;
}

export function rankScore(input: RankedScoreInput): number {
  const { item, request, now, pinned, domainMatch } = input;
  const tw = taskTypeWeight(request.taskType, String(item.source.kind));
  const conf = (item.confidence ?? 50) / 100;
  const rec = recencyScore(
    item.source.version ? new Date(Number(item.source.version) || Date.now()).toISOString() : now.toISOString(),
    now,
    request.recency,
  );
  const dep = pinned ? 1.0 : 0.5;
  const dom = domainMatch ? 1.0 : 0.5;
  // Weighted blend.
  return 0.4 * tw + 0.2 * conf + 0.15 * rec + 0.15 * dep + 0.1 * dom;
}

export function filterByConfidence<T extends { confidence?: number }>(
  items: T[],
  threshold?: number,
): T[] {
  if (threshold === undefined) return items;
  return items.filter((i) => (i.confidence ?? 100) >= threshold);
}

export function deduplicate(items: ContextItem[]): ContextItem[] {
  const seen = new Set<string>();
  const out: ContextItem[] = [];
  for (const item of items) {
    const key = `${item.source.sourceKind}:${item.source.externalId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
