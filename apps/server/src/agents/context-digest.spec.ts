import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_DIGEST_CONFIG, digestKnowledgeItems } from './context-digest';
import type { KnowledgeItemSummary } from './types';

const LONG_DESCRIPTION = `Line one with a long description that keeps going.\n\nSecond paragraph with evidence and reasoning that should not survive the digest.`;

function item(overrides: Partial<KnowledgeItemSummary> = {}): KnowledgeItemSummary {
  return {
    externalId: 'FR-001',
    type: 'FUNCTIONAL_REQUIREMENT',
    title: 'Requirement',
    description: LONG_DESCRIPTION,
    status: 'CONFIRMED',
    source: 'requirements-engineering',
    ...overrides,
  };
}

test('items from immediate upstream agents pass through with full detail', () => {
  const items = [
    item({ source: 'product-analysis', externalId: 'FEAT-001' }),
    item({ source: 'business-analysis', externalId: 'BR-001' }),
  ];

  const digested = digestKnowledgeItems(items, 'requirements-engineering');

  assert.equal(digested[0].description, LONG_DESCRIPTION);
  assert.equal(digested[1].description, LONG_DESCRIPTION);
});

test('sourceCategory suffix does not break immediate-upstream matching', () => {
  const items = [
    item({ source: 'product-analysis::features', externalId: 'FEAT-001' }),
    item({ source: 'business-analysis::goals', externalId: 'BR-001' }),
    item({ source: 'discovery::facts', externalId: 'FACT-001', type: 'CONFIRMED_FACT' }),
  ];

  const digested = digestKnowledgeItems(items, 'requirements-engineering', {
    maxDescriptionLength: 60,
  });

  assert.equal(digested[0].description, LONG_DESCRIPTION);
  assert.equal(digested[1].description, LONG_DESCRIPTION);
  assert.ok(digested[2].description && digested[2].description.length <= 60);
});

test('distant upstream items are reduced to externalId/title/one-line description', () => {
  const items = [
    item({ source: 'discovery', externalId: 'FACT-001', type: 'CONFIRMED_FACT' }),
    item({ source: 'research', externalId: 'COMP-001', type: 'RESEARCH_SUMMARY' }),
  ];

  const digested = digestKnowledgeItems(items, 'requirements-engineering', {
    maxDescriptionLength: 60,
  });

  assert.equal(digested[0].externalId, 'FACT-001');
  assert.equal(digested[0].title, 'Requirement');
  assert.equal(digested[0].type, 'CONFIRMED_FACT');
  assert.ok(digested[0].description && digested[0].description.length <= 60);
  assert.equal(digested[0].description?.includes('\n'), false, 'digest must be one line');
  assert.equal(digested[1].description?.length ?? 0, 60, 'long descriptions are truncated');
});

test('Solution Architect gets full detail from AI/Data/UX and digests of distant agents', () => {
  const items = [
    item({ source: 'ai-architecture', externalId: 'LLM-001' }),
    item({ source: 'data-architecture', externalId: 'TBL-001' }),
    item({ source: 'ux-design', externalId: 'SCR-001' }),
    item({ source: 'discovery', externalId: 'FACT-001' }),
    item({ source: 'research', externalId: 'COMP-001' }),
    item({ source: 'product-analysis', externalId: 'FEAT-001' }),
    item({ source: 'business-analysis', externalId: 'BR-001' }),
  ];

  const digested = digestKnowledgeItems(items, 'solution-architecture');

  assert.equal(digested[0].description, LONG_DESCRIPTION);
  assert.equal(digested[1].description, LONG_DESCRIPTION);
  assert.equal(digested[2].description, LONG_DESCRIPTION);
  for (const distant of digested.slice(3)) {
    assert.ok(distant.description && distant.description.length <= 120);
  }
});

test('document stages digest distant upstream items and keep immediate upstream items full', () => {
  const items = [
    item({ source: 'requirements-engineering', externalId: 'FR-001' }),
    item({ source: 'discovery', externalId: 'FACT-001' }),
  ];

  const digested = digestKnowledgeItems(items, 'frd-generation');
  assert.equal(
    digested[0].description,
    LONG_DESCRIPTION,
    'immediate upstream items must stay full',
  );
  assert.ok(
    digested[1].description && digested[1].description.length <= 120,
    'distant upstream items must be digested for document stages',
  );
});

test('validation/debate take a global digest view of the whole pipeline', () => {
  const items = [
    item({ source: 'estimation', externalId: 'TEAM-001' }),
    item({ source: 'qa-planning', externalId: 'TC-001' }),
    item({ source: 'discovery', externalId: 'FACT-001' }),
  ];

  for (const consumer of ['validation', 'debate']) {
    const digested = digestKnowledgeItems(items, consumer);
    for (const d of digested) {
      assert.ok(d.description && d.description.length <= 120);
    }
  }
});

test('digest config covers every structured agent in the pipeline', () => {
  const structured = [
    'discovery',
    'research',
    'business-analysis',
    'product-analysis',
    'requirements-engineering',
    'ux-design',
    'data-architecture',
    'ai-architecture',
    'solution-architecture',
    'security-review',
    'qa-planning',
    'estimation',
    'validation',
    'debate',
  ];
  for (const agentKey of structured) {
    assert.ok(AGENT_DIGEST_CONFIG[agentKey], `missing digest config for '${agentKey}'`);
  }
});
