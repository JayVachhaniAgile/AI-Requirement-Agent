import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTEXT_DOMAINS,
  DOMAIN_LABELS,
  domainForType,
  domainsForAgent,
  isContextDomain,
  isContextOperation,
  typesForDomain,
} from './context-domains';

test('defines exactly the 24 canonical domains', () => {
  assert.equal(CONTEXT_DOMAINS.length, 24);
  for (const domain of CONTEXT_DOMAINS) {
    assert.ok(isContextDomain(domain), `${domain} must resolve as a domain`);
    assert.ok(DOMAIN_LABELS[domain], `${domain} must have a label`);
  }
});

test('maps legacy knowledge item types onto their canonical domain', () => {
  assert.equal(domainForType('BUSINESS_GOAL'), 'business_goals');
  assert.equal(domainForType('FUNCTIONAL_REQUIREMENT'), 'functional_requirements');
  assert.equal(domainForType('ASSUMPTION'), 'assumptions');
  assert.equal(domainForType('CONSTRAINT'), 'constraints');
  assert.equal(domainForType('RISK'), 'risks');
  assert.equal(domainForType('PERSONA'), 'personas');
  assert.equal(domainForType('USER_STORY'), 'user_stories');
  assert.equal(domainForType('STAKEHOLDER'), 'stakeholders');
  assert.equal(domainForType('FRD_DOCUMENT'), 'document_summaries');
});

test('returns null for types outside the 24 domains', () => {
  assert.equal(domainForType('VALIDATION_SCORES'), null);
  assert.equal(domainForType('CRITIC_SCORE'), null);
  assert.equal(domainForType(''), null);
});

test('every type listed for a domain resolves back to that domain', () => {
  for (const domain of CONTEXT_DOMAINS) {
    for (const type of typesForDomain(domain)) {
      assert.equal(domainForType(type), domain, `${type} should map to ${domain}`);
    }
  }
});

test('unknown agents fall back to all domains', () => {
  assert.deepEqual(domainsForAgent('not-an-agent'), [...CONTEXT_DOMAINS]);
  assert.ok(domainsForAgent('requirements-engineering').includes('acceptance_criteria'));
  assert.ok(domainsForAgent('validation').length === CONTEXT_DOMAINS.length);
});

test('recognizes the supported operations', () => {
  for (const op of ['create', 'upsert', 'delete', 'supersede']) {
    assert.ok(isContextOperation(op), `${op} must be a valid operation`);
  }
  assert.equal(isContextOperation('update'), false);
});
