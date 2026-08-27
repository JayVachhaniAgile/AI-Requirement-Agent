import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAllowedIdIndex,
  validateAgentOutput,
  validateReferences,
} from './validate-agent-output';
import type { AgentValidationConfig, UpstreamIdIndex } from './validation.types';

const UPSTREAM: UpstreamIdIndex = {
  BR: new Set(['BR-001', 'BR-002', 'BR-003', 'BR-004', 'BR-005']),
  FEAT: new Set(['FEAT-001', 'FEAT-002', 'FEAT-003', 'FEAT-004']),
  FR: new Set([
    'FR-001',
    'FR-002',
    'FR-003',
    'FR-004',
    'FR-005',
    'FR-006',
    'FR-007',
    'FR-008',
    'FR-009',
    'FR-010',
  ]),
};

function makeFr(index: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const i = String(index).padStart(3, '0');
  return {
    externalId: `FR-${i}`,
    title: `Requirement ${i}`,
    module: 'Core',
    actor: 'User',
    description: `The system must do ${i}.`,
    priority: 'MUST_HAVE',
    relatedBR: 'BR-001',
    relatedFeature: 'FEAT-001',
    acceptanceCriteria: [{ id: `AC-${i}-01`, given: 'context', when: 'action', then: 'outcome' }],
    ...overrides,
  };
}

function makeValidRequirementsEngineerOutput(): Record<string, unknown> {
  return {
    functionalRequirements: Array.from({ length: 10 }, (_, i) => makeFr(i + 1)),
    userStories: [
      {
        externalId: 'US-001',
        title: 'User can complete flow',
        asA: 'User',
        iWant: 'to complete the flow',
        soThat: 'I get value',
        relatedFR: 'FR-001',
      },
    ],
  };
}

function findingsByCode(result: { findings: Array<{ code: string }> }, code: string): number {
  return result.findings.filter((f) => f.code === code).length;
}

test('valid RE output passes with zero findings (no false positives)', () => {
  const result = validateAgentOutput({
    agentKey: 'requirements-engineering',
    output: makeValidRequirementsEngineerOutput(),
    allowedIdsByPrefix: UPSTREAM,
  });

  assert.equal(result.valid, true);
  assert.equal(result.findings.length, 0);
});

test('dangling relatedFeature produces structured failure with field, value, and valid IDs', () => {
  const output = makeValidRequirementsEngineerOutput();
  output.functionalRequirements = [
    makeFr(1, { relatedFeature: 'FEAT-099' }),
    ...Array.from({ length: 9 }, (_, i) => makeFr(i + 2)),
  ];

  const result = validateAgentOutput({
    agentKey: 'requirements-engineering',
    output,
    allowedIdsByPrefix: UPSTREAM,
  });

  assert.equal(result.valid, false);
  const finding = result.findings.find(
    (f) => f.field === 'functionalRequirements[].relatedFeature',
  );
  assert.ok(finding, 'expected a finding on relatedFeature');
  assert.equal(finding.code, 'DANGLING_REFERENCE');
  assert.equal(finding.value, 'FEAT-099');
  assert.deepEqual(finding.details?.validIds, ['FEAT-001', 'FEAT-002', 'FEAT-003', 'FEAT-004']);
  assert.match(finding.message, /FEAT-099/);
  assert.match(finding.message, /FEAT-001/);
});

test('reference with a forbidden prefix is rejected with allowed prefixes', () => {
  const output = makeValidRequirementsEngineerOutput();
  output.functionalRequirements = [
    makeFr(1, { relatedBR: 'FR-001' }),
    ...Array.from({ length: 9 }, (_, i) => makeFr(i + 2)),
  ];

  const result = validateAgentOutput({
    agentKey: 'requirements-engineering',
    output,
    allowedIdsByPrefix: UPSTREAM,
  });

  const finding = result.findings.find((f) => f.field === 'functionalRequirements[].relatedBR');
  assert.ok(finding);
  assert.equal(finding.code, 'DANGLING_REFERENCE');
  assert.deepEqual(finding.details?.allowed, ['BR']);
});

test('invalid enum value is rejected with the allowed set', () => {
  const result = validateAgentOutput({
    agentKey: 'security-review',
    output: {
      authnAuthz: [
        { externalId: 'SEC-AUTH-001', title: 'Auth', description: 'Login' },
        { externalId: 'SEC-AUTH-002', title: 'MFA', description: 'MFA' },
        { externalId: 'SEC-AUTH-003', title: 'Sessions', description: 'Sessions' },
      ],
      owaspFindings: [
        { externalId: 'OWASP-001', title: 'XSS', description: 'x' },
        { externalId: 'OWASP-002', title: 'Injection', description: 'x' },
        { externalId: 'OWASP-003', title: 'CSRF', description: 'x' },
        { externalId: 'OWASP-004', title: 'AuthZ', description: 'x' },
      ],
      securitySummary: 'Summary',
      riskRating: 'Severe',
    },
  });

  const finding = result.findings.find((f) => f.field === 'riskRating');
  assert.ok(finding);
  assert.equal(finding.code, 'INVALID_ENUM');
  assert.deepEqual(finding.details?.allowed, ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
  assert.equal(finding.value, 'Severe');
});

test('duplicate externalId within one agent output is a failure', () => {
  const result = validateAgentOutput({
    agentKey: 'discovery',
    output: {
      ideaInterpretation: 'Idea',
      problemStatement: 'Problem',
      proposedSolution: 'Solution',
      initialScope: 'Scope',
      confirmedFacts: [
        { externalId: 'FACT-001', title: 'A', description: 'd' },
        { externalId: 'FACT-001', title: 'B', description: 'd' },
        { externalId: 'FACT-002', title: 'C', description: 'd' },
        { externalId: 'FACT-003', title: 'D', description: 'd' },
      ],
      assumptions: [],
      businessGoals: [],
      userGoals: [],
      users: [],
      blockingQuestions: [],
      riskFlags: [
        { title: 'R1', description: 'd' },
        { title: 'R2', description: 'd' },
        { title: 'R3', description: 'd' },
      ],
    },
  });

  assert.equal(findingsByCode(result, 'DUPLICATE_ID'), 1);
});

test('missing required field is a failure', () => {
  const result = validateAgentOutput({
    agentKey: 'discovery',
    output: {
      problemStatement: 'Problem',
      proposedSolution: 'Solution',
      initialScope: 'Scope',
    },
  });

  const finding = result.findings.find(
    (f) => f.code === 'MISSING_FIELD' && f.field === 'ideaInterpretation',
  );
  assert.ok(finding);
});

test('array below stated min is a failure unless a summary field explains why', () => {
  const uxConfig: AgentValidationConfig = {
    agentKey: 'ux-design',
    requiredFields: { navigationFlow: 'string' },
    arrays: [
      { path: 'personas', min: 2, max: 4, itemFields: { title: 'string', description: 'string' } },
      { path: 'userJourneys', min: 0, max: 6 },
      { path: 'screens', min: 0, max: 12 },
      { path: 'uxGuidelines', min: 0, max: 8 },
      { path: 'accessibility', min: 0, max: 6 },
      { path: 'wireframeDescriptions', min: 0, max: 8 },
    ],
  };
  const belowMin = validateAgentOutput({
    agentKey: 'ux-design',
    config: uxConfig,
    output: {
      personas: [{ externalId: 'UXP-001', title: 'A', description: 'd' }],
      userJourneys: [],
      screens: [],
      navigationFlow: 'flow',
      uxSummary: 'summary',
      uxGuidelines: [],
      accessibility: [],
      wireframeDescriptions: [],
    },
  });
  const personasFinding = belowMin.findings.find(
    (f) => f.code === 'ARRAY_BELOW_MIN' && f.field === 'personas',
  );
  assert.ok(personasFinding, 'expected a below-min finding on personas');
  assert.match(personasFinding.message, /expected at least 2/);

  const validationConfig: AgentValidationConfig = {
    agentKey: 'validation',
    requiredFields: { validationResult: 'string', summary: 'string' },
    arrays: [
      {
        path: 'issues',
        min: 3,
        max: 8,
        itemFields: {
          severity: 'string',
          category: 'string',
          sourceAgent: 'string',
          problem: 'string',
        },
      },
    ],
    enums: [{ path: 'validationResult', values: ['PASS', 'CONDITIONAL_PASS', 'FAIL'] }],
    summaryFields: ['summary'],
  };
  const excused = validateAgentOutput({
    agentKey: 'validation',
    config: validationConfig,
    output: {
      validationResult: 'PASS',
      summary: 'Only two real issues found after review.',
      scores: { consistency: 8 },
      issues: [
        {
          externalId: 'VAL-001',
          severity: 'HIGH',
          category: 'DUPLICATE',
          sourceAgent: 'requirements-engineering',
          problem: 'p',
        },
        {
          externalId: 'VAL-002',
          severity: 'LOW',
          category: 'OTHER',
          sourceAgent: 'requirements-engineering',
          problem: 'p',
        },
      ],
    },
  });
  assert.equal(excused.valid, true);
  assert.equal(findingsByCode(excused, 'ARRAY_BELOW_MIN'), 0);
  assert.equal(excused.warnings.filter((w) => w.code === 'ARRAY_BELOW_MIN').length, 1);
});

test('array above stated max is a failure; hitting exact max raises a padding flag only', () => {
  const discoveryFixture = (confirmedFactsCount: number) => ({
    ideaInterpretation: 'Idea',
    problemStatement: 'Problem',
    proposedSolution: 'Solution',
    initialScope: 'Scope',
    confirmedFacts: Array.from({ length: confirmedFactsCount }, (_, i) => ({
      externalId: `FACT-00${i + 1}`,
      title: `F${i}`,
      description: 'd',
    })),
    assumptions: Array.from({ length: 4 }, (_, i) => ({
      externalId: `ASM-00${i + 1}`,
      title: `A${i}`,
      description: 'd',
    })),
    businessGoals: Array.from({ length: 3 }, (_, i) => ({
      externalId: `BG-00${i + 1}`,
      title: `B${i}`,
      description: 'd',
    })),
    userGoals: Array.from({ length: 3 }, (_, i) => ({
      externalId: `UG-00${i + 1}`,
      title: `U${i}`,
      description: 'd',
    })),
    users: Array.from({ length: 2 }, (_, i) => ({
      externalId: `USER-00${i + 1}`,
      title: `P${i}`,
      description: 'd',
    })),
    blockingQuestions: [],
    riskFlags: [
      { title: 'R1', description: 'd' },
      { title: 'R2', description: 'd' },
      { title: 'R3', description: 'd' },
    ],
  });

  const aboveMax = validateAgentOutput({
    agentKey: 'discovery',
    output: discoveryFixture(9),
  });
  assert.equal(findingsByCode(aboveMax, 'ARRAY_ABOVE_MAX'), 1);

  const atMax = validateAgentOutput({
    agentKey: 'discovery',
    output: discoveryFixture(8),
  });
  assert.equal(atMax.valid, true);
  assert.equal(atMax.paddingFlags.length, 1);
  assert.match(atMax.paddingFlags[0].message, /exact stated max/);
});

test('critic scores outside 0-10 range are rejected', () => {
  const result = validateAgentOutput({
    agentKey: 'validation',
    output: {
      validationResult: 'CONDITIONAL_PASS',
      summary: 'Summary',
      scores: { consistency: 11, testability: 4 },
      issues: [
        {
          externalId: 'VAL-001',
          severity: 'HIGH',
          category: 'DUPLICATE',
          sourceAgent: 'requirements-engineering',
          problem: 'p',
        },
        {
          externalId: 'VAL-002',
          severity: 'LOW',
          category: 'OTHER',
          sourceAgent: 'requirements-engineering',
          problem: 'p',
        },
        {
          externalId: 'VAL-003',
          severity: 'MEDIUM',
          category: 'OTHER',
          sourceAgent: 'requirements-engineering',
          problem: 'p',
        },
      ],
    },
  });

  const finding = result.findings.find((f) => f.field === 'scores.consistency');
  assert.ok(finding);
  assert.equal(finding.code, 'INVALID_SCORE');
  assert.equal(findingsByCode(result, 'INVALID_SCORE'), 1);
});

test('critic issues without externalId pass — the service backfills VAL-xxx ids', () => {
  const result = validateAgentOutput({
    agentKey: 'validation',
    output: {
      validationResult: 'CONDITIONAL_PASS',
      summary: 'Summary',
      scores: { consistency: 8 },
      issues: [
        {
          severity: 'HIGH',
          category: 'DUPLICATE',
          sourceAgent: 'requirements-engineering',
          problem: 'p',
        },
        {
          severity: 'LOW',
          category: 'OTHER',
          sourceAgent: 'requirements-engineering',
          problem: 'p',
        },
        {
          severity: 'MEDIUM',
          category: 'OTHER',
          sourceAgent: 'requirements-engineering',
          problem: 'p',
        },
      ],
    },
  });

  assert.equal(result.valid, true);
  assert.equal(result.findings.length, 0);
});

test('scalar numberRanges reject out-of-bounds values', () => {
  const result = validateAgentOutput({
    agentKey: 'gap-analysis',
    output: {
      coveragePct: 120,
      qualityScore: 50,
      totalGaps: 5,
      resolvedGaps: 0,
      remainingGaps: 5,
      stopAfterThisIteration: false,
      summary: 'summary',
      findings: [],
    },
  });

  const finding = result.findings.find((f) => f.field === 'coveragePct');
  assert.ok(finding);
  assert.equal(finding.code, 'INVALID_SCORE');
  assert.match(finding.message, /between 0 and 100/);
  assert.equal(findingsByCode(result, 'INVALID_SCORE'), 1);
});

test('validateReferences is a standalone generic function', () => {
  const findings = validateReferences({ items: [{ relatedFR: 'FR-099' }] }, UPSTREAM, [
    { path: 'items[].relatedFR', allowedPrefixes: ['FR'] },
  ]);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].value, 'FR-099');
  assert.deepEqual(findings[0].details?.validIds, [
    'FR-001',
    'FR-002',
    'FR-003',
    'FR-004',
    'FR-005',
    'FR-006',
    'FR-007',
    'FR-008',
    'FR-009',
    'FR-010',
  ]);
});

test('buildAllowedIdIndex groups upstream IDs by prefix', () => {
  const index = buildAllowedIdIndex([
    { externalId: 'BR-001' },
    { externalId: 'BR-002' },
    { externalId: 'FEAT-001' },
    { externalId: null },
  ]);

  assert.deepEqual([...index.BR], ['BR-001', 'BR-002']);
  assert.deepEqual([...index.FEAT], ['FEAT-001']);
  assert.equal(index.FR, undefined);
});

test('unknown agent key is a structured failure, not a crash', () => {
  const result = validateAgentOutput({
    agentKey: 'does-not-exist',
    output: {},
  });

  assert.equal(result.valid, false);
  assert.match(result.findings[0].message, /No validation config registered/);
});

test('idFields with requireIds reject items missing externalId', () => {
  const result = validateAgentOutput({
    agentKey: 'product-analysis',
    output: {
      productVision: 'v',
      valueProposition: 'vp',
      mvpScope: 'm',
      personas: [{ externalId: 'PER-001', title: 't', description: 'd' }],
      modules: [{ externalId: 'MOD-001', title: 't', description: 'd' }],
      features: [{ title: 'No ID', description: 'd', priority: 'MUST_HAVE', module: 'MOD-001' }],
      successMetrics: [{ title: 't', description: 'd' }],
      lowConfidenceFlags: [],
    },
  });
  const finding = result.findings.find((f) => f.field === 'features[].externalId');
  assert.ok(finding, 'expected a hard finding for missing feature id');
  assert.equal(finding.code, 'MISSING_FIELD');
});
