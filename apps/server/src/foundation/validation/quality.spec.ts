import { test } from 'node:test';

// ---------------------------------------------------------------------------
// Phase 8 — Centralized Quality Gate Engine tests (DEFERRED per migration plan).
//
// TODO: schema failures — invalid canonical body → schema check BLOCKED
// TODO: completeness — missing required fields lower the score
// TODO: consistency — functional requirement without actors → WARNING
// TODO: provenance — FACT without sources → traceability BLOCKED
// TODO: dependency integrity — dangling reference flags issues
// TODO: confidence — missing/low confidence flags the check
// TODO: conflicts — OAuth requirement vs password-only architecture → BLOCKED
// TODO: blocking rules — critical issues → status BLOCKED
// TODO: warnings — advisory issues → status WARNING
// TODO: threshold configuration — env overrides change PASS/WARNING cutoffs
// TODO: artifact-specific gates — requirement(85) vs test_case(80) thresholds
//
// No test cases are written yet so the engine can land first.
// ---------------------------------------------------------------------------

test('placeholder — quality engine tests deferred (see TODOs above)', () => {
  // Intentionally empty: test runner requires at least one test per file.
});
