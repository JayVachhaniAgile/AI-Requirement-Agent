/**
 * Per-document-type section renderers (Phase 9) — deterministic markdown
 * compiled from canonical artifacts. Every section is a pure function.
 */
import type { CompilerArtifact, CompilerDocumentType } from './compiler.types';
import { h2, kvBlock, paragraph, sortArtifacts, table } from './compiler.markdown';

export interface RenderedSection {
  title: string;
  body: string;
}

function byKind(artifacts: CompilerArtifact[], kind: string): CompilerArtifact[] {
  return sortArtifacts(artifacts.filter((a) => a.kind === kind));
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function goalsSection(artifacts: CompilerArtifact[]): RenderedSection {
  const goals = byKind(artifacts, 'project_goal');
  const rows = goals.map((g) => [g.externalId, g.title, g.summary ?? '']);
  return {
    title: 'Project Goals',
    body:
      goals.length === 0
        ? ''
        : table(['ID', 'Goal', 'Description'], rows),
  };
}

function actorsSection(artifacts: CompilerArtifact[]): RenderedSection {
  const actors = byKind(artifacts, 'actor');
  const rows = actors.map((a) => [a.externalId, a.title, a.summary ?? '']);
  return {
    title: 'Actors & Roles',
    body: actors.length === 0 ? '' : table(['ID', 'Actor', 'Description'], rows),
  };
}

function requirementsSection(artifacts: CompilerArtifact[], title = 'Functional & Non-Functional Requirements'): RenderedSection {
  const reqs = sortArtifacts(
    artifacts.filter((a) => ['requirement', 'non_functional_requirement', 'security_requirement'].includes(a.kind)),
  );
  const rows = reqs.map((r) => {
    const body = r.body ?? {};
    return [
      r.externalId,
      r.title,
      String(body.priority ?? ''),
      String(body.classification ?? ''),
      Array.isArray(body.actors) ? (body.actors as string[]).join(', ') : '',
      r.summary ?? '',
    ];
  });
  return {
    title,
    body: reqs.length === 0 ? '' : table(['ID', 'Title', 'Priority', 'Classification', 'Actors', 'Description'], rows),
  };
}

function businessRulesSection(artifacts: CompilerArtifact[]): RenderedSection {
  const rules = byKind(artifacts, 'business_rule');
  const rows = rules.map((r) => [r.externalId, r.title, r.summary ?? '']);
  return {
    title: 'Business Rules',
    body: rules.length === 0 ? '' : table(['ID', 'Rule', 'Description'], rows),
  };
}

function assumptionsSection(artifacts: CompilerArtifact[]): RenderedSection {
  const assumptions = byKind(artifacts, 'assumption');
  const rows = assumptions.map((a) => [a.externalId, a.title, a.summary ?? '']);
  return {
    title: 'Assumptions',
    body: assumptions.length === 0 ? '' : table(['ID', 'Assumption', 'Details'], rows),
  };
}

function risksSection(artifacts: CompilerArtifact[]): RenderedSection {
  const risks = byKind(artifacts, 'risk');
  const rows = risks.map((r) => {
    const body = r.body ?? {};
    return [r.externalId, r.title, String(body.likelihood ?? ''), String(body.impact ?? ''), r.summary ?? ''];
  });
  return {
    title: 'Risks',
    body: risks.length === 0 ? '' : table(['ID', 'Risk', 'Likelihood', 'Impact', 'Mitigation'], rows),
  };
}

function storiesSection(artifacts: CompilerArtifact[]): RenderedSection {
  const stories = byKind(artifacts, 'user_story');
  const rows = stories.map((s) => {
    const body = s.body ?? {};
    return [s.externalId, s.title, String(body.asA ?? ''), String(body.iWant ?? ''), String(body.soThat ?? '')];
  });
  return {
    title: 'User Stories',
    body: stories.length === 0 ? '' : table(['ID', 'Story', 'As a', 'I want', 'So that'], rows),
  };
}

function acceptanceCriteriaSection(artifacts: CompilerArtifact[]): RenderedSection {
  const criteria = byKind(artifacts, 'acceptance_criterion');
  const rows = criteria.map((c) => {
    const body = c.body ?? {};
    return [c.externalId, c.title, String(body.given ?? ''), String(body.when ?? ''), String(body.then ?? '')];
  });
  return {
    title: 'Acceptance Criteria',
    body: criteria.length === 0 ? '' : table(['ID', 'Criterion', 'Given', 'When', 'Then'], rows),
  };
}

function entitiesSection(artifacts: CompilerArtifact[]): RenderedSection {
  const entities = byKind(artifacts, 'entity');
  const blocks = entities.map((e) => {
    const body = e.body ?? {};
    const attributes = Array.isArray(body.attributes) ? (body.attributes as Array<Record<string, unknown>>) : [];
    const rows = attributes.map((a) => [String(a.name ?? ''), String(a.type ?? ''), a.required ? 'yes' : 'no']);
    return [h2(e.externalId + ' — ' + e.title), paragraph(e.summary ?? ''), table(['Attribute', 'Type', 'Required'], rows)].filter(Boolean).join('\n\n');
  });
  return {
    title: 'Entities',
    body: blocks.length === 0 ? '' : blocks.join('\n\n'),
  };
}

function relationshipsSection(artifacts: CompilerArtifact[]): RenderedSection {
  const rels = byKind(artifacts, 'relationship');
  const rows = rels.map((r) => {
    const body = r.body ?? {};
    return [r.externalId, String(body.fromEntityRef ?? ''), String(body.relation ?? ''), String(body.toEntityRef ?? ''), r.summary ?? ''];
  });
  return {
    title: 'Relationships',
    body: rels.length === 0 ? '' : table(['ID', 'From', 'Relation', 'To', 'Description'], rows),
  };
}

function apisSection(artifacts: CompilerArtifact[]): RenderedSection {
  const apis = byKind(artifacts, 'api');
  const rows = apis.map((a) => {
    const body = a.body ?? {};
    return [a.externalId, String(body.method ?? ''), String(body.path ?? ''), a.summary ?? ''];
  });
  return {
    title: 'APIs',
    body: apis.length === 0 ? '' : table(['ID', 'Method', 'Path', 'Summary'], rows),
  };
}

function securitySection(artifacts: CompilerArtifact[]): RenderedSection {
  const sec = byKind(artifacts, 'security_requirement');
  const rows = sec.map((s) => {
    const body = s.body ?? {};
    return [s.externalId, s.title, String(body.category ?? ''), s.summary ?? ''];
  });
  return {
    title: 'Security Requirements',
    body: sec.length === 0 ? '' : table(['ID', 'Requirement', 'Category', 'Description'], rows),
  };
}

function testCasesSection(artifacts: CompilerArtifact[]): RenderedSection {
  const tests = byKind(artifacts, 'test_case');
  const rows = tests.map((t) => {
    const body = t.body ?? {};
    return [
      t.externalId,
      t.title,
      String(body.type ?? ''),
      Array.isArray(body.steps) ? String((body.steps as string[]).length) : '0',
      String(body.expectedResult ?? ''),
    ];
  });
  return {
    title: 'Test Cases',
    body: tests.length === 0 ? '' : table(['ID', 'Test', 'Type', 'Steps', 'Expected Result'], rows),
  };
}

function scopeSection(artifacts: CompilerArtifact[]): RenderedSection {
  const scope = byKind(artifacts, 'scope_item');
  const rows = scope.map((s) => {
    const body = s.body ?? {};
    return [s.externalId, s.title, String(body.inScope === true ? 'in scope' : body.inScope === false ? 'out of scope' : ''), s.summary ?? ''];
  });
  return {
    title: 'Scope',
    body: scope.length === 0 ? '' : table(['ID', 'Item', 'Scope', 'Description'], rows),
  };
}

function estimatesSection(artifacts: CompilerArtifact[]): RenderedSection {
  const estimates = byKind(artifacts, 'estimate');
  const rows = estimates.map((e) => {
    const body = e.body ?? {};
    return [e.externalId, e.title, String(body.optimisticHours ?? ''), String(body.mostLikelyHours ?? ''), String(body.pessimisticHours ?? ''), String(body.team ?? '')];
  });
  return {
    title: 'Estimates',
    body: estimates.length === 0 ? '' : table(['ID', 'Item', 'Optimistic', 'Most Likely', 'Pessimistic', 'Team'], rows),
  };
}

function architectureDecisionsSection(artifacts: CompilerArtifact[]): RenderedSection {
  const decisions = byKind(artifacts, 'architecture_decision');
  const blocks = decisions.map((d) => {
    const body = d.body ?? {};
    return [
      h2(d.externalId + ' — ' + d.title),
      kvBlock([
        ['Decision', String(body.decision ?? '')],
        ['Rationale', String(body.rationale ?? '')],
        ['Consequences', Array.isArray(body.consequences) ? (body.consequences as string[]).join('; ') : ''],
      ]),
    ].join('\n\n');
  });
  return {
    title: 'Architecture Decisions',
    body: blocks.length === 0 ? '' : blocks.join('\n\n'),
  };
}

// ---------------------------------------------------------------------------
// Per-document-type section plan
// ---------------------------------------------------------------------------

export const SECTION_PLANS: Record<CompilerDocumentType, Array<(a: CompilerArtifact[]) => RenderedSection>> = {
  FRD: [goalsSection, actorsSection, requirementsSection, businessRulesSection, assumptionsSection, risksSection],
  USER_STORIES: [requirementsSection, storiesSection, acceptanceCriteriaSection],
  TECHNICAL_ARCHITECTURE: [architectureDecisionsSection, apisSection, entitiesSection],
  DATABASE_DESIGN: [entitiesSection, relationshipsSection],
  API_SPECIFICATION: [apisSection, securitySection],
  QA_DOCUMENT: [requirementsSection, testCasesSection],
  SOW: [scopeSection, estimatesSection, requirementsSection],
  BUILD_PROMPT: [
    goalsSection,
    actorsSection,
    requirementsSection,
    storiesSection,
    entitiesSection,
    apisSection,
    testCasesSection,
  ],
};
