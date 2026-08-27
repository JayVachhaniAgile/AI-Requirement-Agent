/**
 * Pure dynamic planner (Phase 7).
 *
 * Given project state + requested outcome:
 *   required artifacts → missing artifacts → required skills →
 *   skill dependency graph → topological levels → conditions/reuse →
 *   quality gates + human checkpoints.
 *
 * No I/O, no Nest imports — fully unit-testable.
 */
import type {
  ApprovalType,
  ConditionRule,
  OrchestrationNodeSpec,
  OrchestrationPlan,
  OrchestrationRequest,
  PlanProjectState,
} from './orchestration.types';
import type { SkillDefinition } from '../skills/skill.types';

export interface PlanningInput {
  request: OrchestrationRequest;
  projectState: PlanProjectState;
  /** Available skill definitions (source of skill→artifact + dependency maps). */
  skillDefinitions: readonly SkillDefinition[];
}

const OUTCOME_TO_ARTIFACTS: Record<string, string[]> = {
  'full-requirements': [
    'requirement',
    'non_functional_requirement',
    'user_story',
    'screen',
    'entity',
    'api',
    'security_requirement',
    'architecture_decision',
    'test_case',
    'estimate',
    'scope_item',
  ],
  'requirements': ['requirement', 'non_functional_requirement', 'user_story'],
  'architecture': ['architecture_decision', 'api', 'entity'],
  'database': ['entity', 'relationship'],
  'security': ['security_requirement', 'risk'],
  'qa': ['test_case'],
};

/**
 * Plan a dynamic execution for the requested outcome.
 *
 * Returns the plan with levels; every node carries its condition, quality
 * gates, artifact contract and reuse flag. Skills that produce no missing
 * artifact and have no transitive dependency are excluded. Nodes skipped at
 * plan time are recorded in `skipped`.
 */
export function planOrchestration(input: PlanningInput): OrchestrationPlan {
  const { request, projectState, skillDefinitions } = input;

  // 1. Required artifacts for the outcome.
  const targetArtifacts =
    request.targetArtifactTypes ??
    OUTCOME_TO_ARTIFACTS[request.requestedOutcome] ??
    OUTCOME_TO_ARTIFACTS['full-requirements'];

  const present = new Set(projectState.artifactTypesPresent);
  const missing = targetArtifacts.filter((t) => !present.has(t));

  // 2. Required skills: any skill producing a missing artifact + transitive deps.
  const byProduced = new Map<string, string[]>();
  for (const def of skillDefinitions) {
    for (const kind of def.producedArtifacts) {
      const list = byProduced.get(kind) ?? [];
      list.push(def.key);
      byProduced.set(kind, list);
    }
  }
  const defByKey = new Map(skillDefinitions.map((d) => [d.key, d]));

  const required = new Set<string>();
  const queue = [...missing];
  const seenArtifacts = new Set<string>();
  while (queue.length > 0) {
    const artifact = queue.shift();
    if (!artifact || seenArtifacts.has(artifact)) continue;
    seenArtifacts.add(artifact);
    for (const skillKey of byProduced.get(artifact) ?? []) {
      if (required.has(skillKey)) continue;
      required.add(skillKey);
      const def = defByKey.get(skillKey);
      for (const dep of def?.dependencies ?? []) {
        required.add(dep.skillKey);
        const depDef = defByKey.get(dep.skillKey);
        for (const produced of depDef?.producedArtifacts ?? []) {
          if (!seenArtifacts.has(produced)) queue.push(produced);
        }
      }
    }
  }

  // 3. Conditional execution + reuse evaluation.
  const nodeSpecs = new Map<string, OrchestrationNodeSpec>();
  const skipped: string[] = [];
  for (const skillKey of required) {
    const def = defByKey.get(skillKey);
    if (!def) continue;
    const condition = conditionFor(def);
    const decision = evaluateCondition(condition, projectState, present);
    if (decision === 'skip') {
      skipped.push(skillKey);
      continue;
    }
    const reuse = decision === 'reuse';
    const dependsOn = def.dependencies.map((d) => d.skillKey).filter((k) => required.has(k));
    nodeSpecs.set(skillKey, {
      id: skillKey,
      skillKey,
      dependsOn,
      level: 0,
      required: true,
      condition,
      qualityGates: [...def.qualityGates],
      producedArtifacts: [...def.producedArtifacts],
      requiredArtifacts: [],
      reuse,
    });
  }

  // 4. Topological levels (Kahn).
  const levels = computeLevels([...nodeSpecs.values()]);

  // 5. Human checkpoints.
  const checkpoints: Record<string, ApprovalType> = {};
  for (const cp of request.humanCheckpoints ?? []) {
    if (nodeSpecs.has(cp.afterSkill)) {
      const node = nodeSpecs.get(cp.afterSkill)!;
      node.checkpoint = true;
      node.approvalType = cp.type;
      checkpoints[cp.afterSkill] = cp.type;
    }
  }

  return {
    projectId: request.projectId,
    requestedOutcome: request.requestedOutcome,
    nodes: Object.fromEntries(nodeSpecs),
    levels,
    checkpoints,
    skipped,
    version: 1,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Incremental planning: restrict the plan to the impact closure of a changed
 * artifact (via ImpactAnalysisService-supplied affected artifact types).
 */
export function planAffectedOnly(
  request: OrchestrationRequest,
  projectState: PlanProjectState,
  skillDefinitions: readonly SkillDefinition[],
  affectedArtifactTypes: string[],
): OrchestrationPlan {
  return planOrchestration({
    request: {
      ...request,
      targetArtifactTypes: affectedArtifactTypes,
      requestedOutcome: request.requestedOutcome,
    },
    projectState: { ...projectState, affectedArtifactTypes },
    skillDefinitions,
  });
}

/** Topological levels via Kahn's algorithm over node dependency edges. */
export function computeLevels(nodes: OrchestrationNodeSpec[]): string[][] {
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const node of nodes) indegree.set(node.id, node.dependsOn.length);
  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      const list = dependents.get(dep) ?? [];
      list.push(node.id);
      dependents.set(dep, list);
    }
  }

  const levels: string[][] = [];
  const remaining = new Set(nodes.map((n) => n.id));
  while (remaining.size > 0) {
    const ready = [...remaining].filter((id) => (indegree.get(id) ?? 0) === 0);
    if (ready.length === 0) {
      // Cycle guard: break remaining as one level (executor will block them).
      levels.push([...remaining]);
      break;
    }
    levels.push(ready);
    for (const id of ready) {
      remaining.delete(id);
      for (const dependent of dependents.get(id) ?? []) {
        indegree.set(dependent, (indegree.get(dependent) ?? 1) - 1);
      }
    }
  }

  // Assign level indexes to nodes.
  const levelById = new Map<string, number>();
  levels.forEach((ids, i) => ids.forEach((id) => levelById.set(id, i)));
  for (const node of nodes) node.level = levelById.get(node.id) ?? 0;
  return levels;
}

export type ConditionDecision = 'run' | 'skip' | 'reuse';

export function evaluateCondition(
  rule: ConditionRule,
  state: PlanProjectState,
  presentArtifacts: Set<string>,
): ConditionDecision {
  switch (rule.type) {
    case 'always':
      return 'run';
    case 'skip-if-no-signal':
      return state.signals[rule.signal] === false ? 'skip' : 'run';
    case 'skip-if-artifact-missing':
      return presentArtifacts.has(rule.artifactType) ? 'run' : 'skip';
    case 'reuse-if-artifact-exists': {
      // `presentArtifacts` only contains valid artifacts (caller filters by
      // status), so presence implies a reusable, valid artifact.
      return presentArtifacts.has(rule.artifactType) ? 'reuse' : 'run';
    }
    default:
      return 'run';
  }
}

/** Default condition per skill: reuse an already-valid produced artifact. */
function conditionFor(def: SkillDefinition): ConditionRule {
  const primary = def.producedArtifacts[0];
  return primary
    ? { type: 'reuse-if-artifact-exists', artifactType: primary }
    : { type: 'always' };
}
