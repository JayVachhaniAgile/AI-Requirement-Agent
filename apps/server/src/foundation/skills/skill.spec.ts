import { test } from 'node:test';

// ---------------------------------------------------------------------------
// Phase 5 — Skill architecture tests (DEFERRED per migration plan).
//
// TODO: skill registration + seeding idempotency (seedAll twice == same rows)
// TODO: skill lookup + version lookup (SkillRegistryService.get / version)
// TODO: enable/disable toggling (list(enabledOnly) filtering)
// TODO: input validation — SkillInput rejected when projectId/task missing
// TODO: output validation — SkillOutput artifacts rejected by canonical pipeline
// TODO: context requirements — defaultContextRequest maps skill -> taskType + domains
// TODO: skill execution — SkillExecutorService happy path with stubbed LLM
// TODO: token tracking — ModelUsage rows written with correct input/output
// TODO: cost tracking — estimatedCostUsd computed from pricing table
// TODO: failure handling — executor marks AgentSkillExecution FAILED + rethrows
// TODO: retry handling — maxAttempts loop on parse/validation failures
// TODO: prompt resolution — buildAgentMessages resolves versioned template
//
// These will be implemented in a dedicated test phase; no test cases are
// written yet so the skill functionality can land first.
// ---------------------------------------------------------------------------

test('placeholder — skill tests deferred (see TODOs above)', () => {
  // Intentionally empty: test runner requires at least one test per file.
});
