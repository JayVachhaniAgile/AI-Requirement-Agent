import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOCUMENT_ID_PATTERNS, checkDocumentDrift, extractDocumentIds } from './document-drift';

test('extractDocumentIds finds every matching ID token', () => {
  const ids = extractDocumentIds(
    '## FR-001 Login\nSee FR-002 and FR-003. Stories: US-001',
    DOCUMENT_ID_PATTERNS.frd,
  );
  assert.deepEqual([...ids].sort(), ['FR-001', 'FR-002', 'FR-003']);
});

test('checkDocumentDrift flags invented IDs and missing source IDs', () => {
  const result = checkDocumentDrift({
    markdown: 'FR-001 present\nFR-099 invented',
    sourceIds: new Set(['FR-001', 'FR-002']),
    patterns: DOCUMENT_ID_PATTERNS.frd,
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.invented, ['FR-099']);
  assert.deepEqual(result.missing, ['FR-002']);
});

test('checkDocumentDrift passes when the document faithfully renders the source', () => {
  const result = checkDocumentDrift({
    markdown: '# FRD\n\n- FR-001\n- FR-002',
    sourceIds: new Set(['FR-001', 'FR-002']),
    patterns: DOCUMENT_ID_PATTERNS.frd,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.invented, []);
  assert.deepEqual(result.missing, []);
});

test('every document stage has ID patterns configured', () => {
  for (const stage of ['frd', 'user-stories', 'tech-arch', 'db-design', 'api-spec', 'sow']) {
    assert.ok(DOCUMENT_ID_PATTERNS[stage].length > 0, `missing patterns for ${stage}`);
  }
});

test('per-stage patterns match the JSON agents ID prefixes', () => {
  assert.ok(
    extractDocumentIds('API-SPEC-003', DOCUMENT_ID_PATTERNS['api-spec']).has('API-SPEC-003'),
  );
  assert.ok(extractDocumentIds('TBL-001', DOCUMENT_ID_PATTERNS['db-design']).has('TBL-001'));
  assert.ok(extractDocumentIds('CMP-007', DOCUMENT_ID_PATTERNS['tech-arch']).has('CMP-007'));
  assert.ok(extractDocumentIds('US-012', DOCUMENT_ID_PATTERNS['user-stories']).has('US-012'));
  assert.ok(extractDocumentIds('FEAT-005', DOCUMENT_ID_PATTERNS.sow).has('FEAT-005'));
  assert.ok(extractDocumentIds('MOD-002', DOCUMENT_ID_PATTERNS.sow).has('MOD-002'));
});
