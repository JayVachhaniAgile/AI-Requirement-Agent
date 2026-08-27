import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GapAnalysisService,
  computeRunMetrics,
  findSectionRange,
  isActionableFinding,
  mapFindingToDocumentType,
  mergePatch,
  normalizeSectionTitle,
} from './gap-analysis.service';

function buildService() {
  const finding = {
    document: 'DB_DESIGN_DOCUMENT',
    action: 'UPDATE' as const,
    section: 'Tables',
    finding: 'Add missing indexes',
    explanation: 'Indexes are missing',
    severity: 'MEDIUM' as const,
    confidence: 85,
    suggestion: 'Add indexes on FK columns',
  };
  const runRow = {
    id: 'run-1',
    projectId: 'p1',
    iteration: 1,
    findingsJson: JSON.stringify([finding]),
    coveragePct: 50,
    qualityScore: 50,
    totalGaps: 1,
    resolvedGaps: 0,
    remainingGaps: 1,
    status: 'COMPLETED',
    summary: 's',
    documentsUpdatedJson: '[]',
    createdAt: new Date(),
  };
  const proposalRows: Array<Record<string, unknown>> = [];
  const runRows: Array<Record<string, unknown>> = [runRow];
  let docContent = '# DB\n## Tables\nold';

  const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => row[k] === v);

  const proposalRepo = {
    find: async (opts?: { where?: Record<string, unknown> }) => {
      const where = opts?.where ?? {};
      return proposalRows.filter((p) => matches(p, where));
    },
    findOne: async ({ where }: { where: Record<string, unknown> }) =>
      proposalRows.find((p) => matches(p, where)) ?? null,
    create: (d: Record<string, unknown>) => d,
    save: async (row: Record<string, unknown>) => {
      proposalRows.push(row);
      return row;
    },
    update: async (id: string, patch: Record<string, unknown>) => {
      Object.assign(proposalRows.find((p) => p.id === id) ?? {}, patch);
    },
    delete: async (idOrCriteria: string | Record<string, unknown>) => {
      if (typeof idOrCriteria === 'string') {
        const idx = proposalRows.findIndex((p) => p.id === idOrCriteria);
        if (idx >= 0) proposalRows.splice(idx, 1);
      }
    },
    count: async () => 0,
  };
  const runRepo = {
    find: async () => runRows,
    findOne: async ({ where }: { where: Record<string, unknown> }) =>
      runRows.find((r) => matches(r, where)) ?? null,
    create: (d: Record<string, unknown>) => d,
    save: async (row: Record<string, unknown>) => {
      runRows.push(row);
      return row;
    },
  };
  const activeRepo = {
    findOne: async () => null,
    update: async () => undefined,
    create: (d: Record<string, unknown>) => d,
    save: async (d: Record<string, unknown>) => d,
    remove: async () => undefined,
  };
  const projectRepo = { findOne: async () => ({ id: 'p1' }) };
  const rkb = {
    getDocumentByType: async () => ({ markdownContent: docContent }),
    saveDocument: async (_projectId: string, merged: string) => {
      docContent = merged;
    },
  };
  let resolveAgent: ((value?: unknown) => void) | null = null;
  let rejectAgent: ((err: Error) => void) | null = null;
  const agentRunner = {
    run: async ({ parse }: { parse: (c: string) => unknown }) =>
      new Promise((resolve, reject) => {
        resolveAgent = () =>
          resolve({
            output: parse(
              JSON.stringify({ mode: 'REPLACE', section: 'Tables', newContent: 'indexes added' }),
            ),
          });
        rejectAgent = reject;
      }),
  };
  const events = { emitGapAnalysisProgress: () => undefined };

  const service = new GapAnalysisService(
    runRepo as never,
    activeRepo as never,
    proposalRepo as never,
    projectRepo as never,
    rkb as never,
    agentRunner as never,
    events as never,
  );

  return {
    service,
    resolveAgent: () => resolveAgent?.(),
    rejectAgent: () => rejectAgent?.(new Error('LLM failed')),
  };
}

test('applyFinding reports APPLYING while in flight, then APPLIED', async () => {
  const { service, resolveAgent } = buildService();

  const pending = service.applyFinding('p1', '1:0');

  // While the (slow) patch agent runs, the finding is reported as applying.
  const mid = await service.getRunStatus('p1');
  assert.deepEqual(mid.applyingFindings, ['1:0']);
  assert.deepEqual(mid.appliedFindings, []);

  resolveAgent();
  const result = await pending;
  assert.deepEqual(result, { applied: true });

  const after = await service.getRunStatus('p1');
  assert.deepEqual(after.appliedFindings, ['1:0']);
  assert.deepEqual(after.applyingFindings, []);
});

test('applyFinding rolls back the APPLYING marker when the patch fails', async () => {
  const { service, rejectAgent } = buildService();

  const pending = service.applyFinding('p1', '1:0');
  const mid = await service.getRunStatus('p1');
  assert.deepEqual(mid.applyingFindings, ['1:0']);

  // Patch agent rejects → the marker is removed and the gap is actionable again.
  rejectAgent();
  await assert.rejects(pending, /LLM failed/);

  const after = await service.getRunStatus('p1');
  assert.deepEqual(after.applyingFindings, []);
  assert.deepEqual(after.appliedFindings, []);
});

test('isActionableFinding selects UPDATE and APPEND only', () => {
  assert.equal(isActionableFinding({ action: 'UPDATE' }), true);
  assert.equal(isActionableFinding({ action: 'APPEND' }), true);
  assert.equal(isActionableFinding({ action: 'KEEP' }), false);
  assert.equal(isActionableFinding({ action: 'DEPRECATE' }), false);
});

test('mapFindingToDocumentType maps document labels to stored types', () => {
  assert.equal(mapFindingToDocumentType('Functional Requirements Document'), 'FRD_DOCUMENT');
  assert.equal(mapFindingToDocumentType('User Stories backlog'), 'USER_STORIES_DOCUMENT');
  assert.equal(mapFindingToDocumentType('High Level Design'), 'TECH_ARCH_DOCUMENT');
  assert.equal(mapFindingToDocumentType('Database Design Document'), 'DB_DESIGN_DOCUMENT');
  assert.equal(mapFindingToDocumentType('API Specification'), 'API_SPEC_DOCUMENT');
  assert.equal(mapFindingToDocumentType('Compiled Master Document'), 'COMPILED_DOCUMENT');
  assert.equal(mapFindingToDocumentType('Unknown artifact'), null);
});

test('mapFindingToDocumentType accepts stored type names as-is', () => {
  assert.equal(mapFindingToDocumentType('FRD_DOCUMENT'), 'FRD_DOCUMENT');
  assert.equal(mapFindingToDocumentType('USER_STORIES_DOCUMENT'), 'USER_STORIES_DOCUMENT');
  assert.equal(mapFindingToDocumentType('TECH_ARCH_DOCUMENT'), 'TECH_ARCH_DOCUMENT');
  assert.equal(mapFindingToDocumentType('DB_DESIGN_DOCUMENT'), 'DB_DESIGN_DOCUMENT');
  assert.equal(mapFindingToDocumentType('API_SPEC_DOCUMENT'), 'API_SPEC_DOCUMENT');
  assert.equal(mapFindingToDocumentType('COMPILED_DOCUMENT'), 'COMPILED_DOCUMENT');
  assert.equal(mapFindingToDocumentType('Tech Architecture'), 'TECH_ARCH_DOCUMENT');
});

test('computeRunMetrics counts total findings and actionable remaining gaps', () => {
  const metrics = computeRunMetrics([
    {
      document: 'API Specification',
      action: 'APPEND' as const,
      section: 'Endpoints',
      finding: 'No audit log endpoint',
      explanation: '',
      severity: 'HIGH' as const,
      suggestion: '',
    },
    {
      document: 'FRD',
      action: 'KEEP' as const,
      section: '',
      finding: 'Already complete',
      explanation: '',
      severity: 'LOW' as const,
      suggestion: '',
    },
  ]);
  assert.equal(metrics.totalGaps, 2);
  assert.equal(metrics.remainingGaps, 1);
  assert.equal(metrics.resolvedGaps, 0);
});

test('computeRunMetrics with no findings reports zeros', () => {
  assert.deepEqual(computeRunMetrics([]), { totalGaps: 0, remainingGaps: 0, resolvedGaps: 0 });
});

test('normalizeSectionTitle strips markers and normalizes case/whitespace', () => {
  assert.equal(normalizeSectionTitle('## 3.2 Data Model '), '3.2 data model');
  assert.equal(normalizeSectionTitle('#Authentication'), 'authentication');
});

test('findSectionRange locates a section and stops at the next same-level heading', () => {
  const lines = ['# Auth', 'Body A', '## Login', 'Body B', '# Billing', 'Body C'];
  const range = findSectionRange(lines, 'Login');
  assert.deepEqual(range, { start: 2, end: 4 });
  assert.equal(findSectionRange(lines, 'Missing'), null);
});

test('mergePatch REPLACE swaps only the matching section body', () => {
  const existing = ['# Auth', 'Old login flow', '# Billing', 'Keep me'].join('\n');

  const merged = mergePatch(existing, {
    mode: 'REPLACE',
    section: 'Auth',
    newContent: 'New login flow with MFA',
  });

  assert.match(merged, /# Auth\n\nNew login flow with MFA/);
  assert.match(merged, /# Billing\nKeep me/);
  assert.doesNotMatch(merged, /Old login flow/);
});

test('mergePatch REPLACE leaves unrelated sections byte-identical', () => {
  const existing = [
    '# Functional Requirements',
    '## Authentication',
    'FR-001 Users can log in.',
    '## Notifications',
    'FR-002 Users get email alerts.',
    '## Reporting',
    'FR-003 Admins can export CSV.',
  ].join('\n');

  const merged = mergePatch(existing, {
    mode: 'REPLACE',
    section: 'Notifications',
    newContent: 'FR-002 Users get email and push alerts.',
  });

  assert.match(merged, /## Authentication\nFR-001 Users can log in\./);
  assert.match(merged, /## Notifications\n\nFR-002 Users get email and push alerts\./);
  assert.match(merged, /## Reporting\nFR-003 Admins can export CSV\./);
  assert.doesNotMatch(merged, /FR-002 Users get email alerts\./);
});

test('mergePatch REPLACE preserves parent heading when newContent starts with a sub-heading', () => {
  const existing = ['# Architecture', '## Database Schema', 'Old tables'].join('\n');

  const merged = mergePatch(existing, {
    mode: 'REPLACE',
    section: 'Database Schema',
    newContent: '### 1.1 Tables\nUsers table',
  });

  assert.match(merged, /## Database Schema\n\n### 1.1 Tables/);
  assert.match(merged, /Users table/);
});

test('mergePatch APPEND adds content without touching existing sections', () => {
  const existing = ['# Auth', 'FR-001 Users can log in.'].join('\n');
  const merged = mergePatch(existing, {
    mode: 'APPEND',
    section: '',
    newContent: '## Audit Log\nADM-001 All admin actions are logged.',
  });
  assert.match(merged, /# Auth\nFR-001 Users can log in\.\n\n## Audit Log\nADM-001 All admin actions are logged\./);
});

test('mergePatch REPLACE falls back to appending when the section is not found', () => {
  const merged = mergePatch('# Auth\nOld', {
    mode: 'REPLACE',
    section: 'Missing Section',
    newContent: 'New content',
  });
  assert.match(merged, /## Missing Section\n\nNew content/);
  assert.match(merged, /# Auth\nOld/);
});

test('mergePatch APPEND adds content at the end of the document', () => {
  const merged = mergePatch('# Auth\nOld', {
    mode: 'APPEND',
    section: '',
    newContent: '## Notifications\nPush alerts',
  });
  assert.match(merged, /# Auth\nOld\n\n## Notifications\nPush alerts/);
});
