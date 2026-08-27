import { test } from 'node:test';

// ---------------------------------------------------------------------------
// Phase 6 — Shadow migration tests (DEFERRED per migration plan).
//
// TODO: adapter translation — legacy AgentContext → SkillInput mapping
// TODO: legacy compatibility — adapter.run returns AgentResult in `legacy` mode
// TODO: shadow execution — skill runs with zero state change (no executions/
//       usage/canonical rows written)
// TODO: comparison — computeComparison completeness/coverage/contradictions
// TODO: feature flags — resolveMigrationMode honors global + per-agent env
// TODO: output parity — mapped skill output item keys vs legacy item keys
// TODO: failure fallback — skill throws → legacy output returned + stored
// TODO: new skill failure — migration rule false in `new` mode → legacy fallback
// TODO: legacy fallback — legacy throws → rethrown unchanged
//
// No test cases are written yet so the adapter functionality can land first.
// ---------------------------------------------------------------------------

test('placeholder — migration tests deferred (see TODOs above)', () => {
  // Intentionally empty: test runner requires at least one test per file.
});
