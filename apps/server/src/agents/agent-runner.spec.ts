import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AgentRunnerService,
  AgentValidationError,
  buildCorrectionMessage,
} from './agent-runner.service';
import type { AgentValidationResult } from '../validation/validation.types';
import type { LLMMessage } from '../llm/llm.service';

interface FakeLlmCall {
  messages: LLMMessage[];
  schema: unknown;
}

class FakeLlm {
  calls: FakeLlmCall[] = [];
  contents: string[];

  constructor(contents: string[]) {
    this.contents = contents;
  }

  async generateForcedStructured(messages: LLMMessage[], schema: unknown) {
    this.calls.push({ messages: [...messages], schema });
    const content = this.contents.shift() ?? '{}';
    return { content, inputTokens: 10, outputTokens: 5, model: 'fake-model' };
  }
}

class FakeValidation {
  results: Array<{ valid: boolean; findings: AgentValidationResult['findings'] }>;

  constructor(results: Array<{ valid: boolean; findings: AgentValidationResult['findings'] }>) {
    this.results = results;
  }

  validate(_agentKey: string, _output: unknown, _upstream: Array<{ externalId?: string | null }>) {
    return {
      ...(this.results.shift() ?? { valid: true, findings: [] }),
      warnings: [],
      paddingFlags: [],
    };
  }
}

const danglingFinding = {
  code: 'DANGLING_REFERENCE' as const,
  field: 'functionalRequirements[].relatedFR',
  value: 'FR-099',
  message:
    "Field 'functionalRequirements[].relatedFR' value 'FR-099' does not exist. Valid FR IDs from input: FR-001.",
  details: { validIds: ['FR-001'] },
};

const SCHEMA = { toolName: 'submit_requirements_engineering_output', schema: { type: 'object' } };
const MESSAGES: LLMMessage[] = [
  { role: 'system', content: 'system' },
  { role: 'user', content: 'user' },
];

const fakeRunLog = {
  log: async () => undefined,
  logRetry: async () => undefined,
  logValidationFailure: async () => undefined,
  logPadding: async () => undefined,
  logLowConfidence: async () => undefined,
};

test('invalid output triggers a correction request, then the retry is re-validated', async () => {
  const llm = new FakeLlm(['{"fr":"one"}', '{"fr":"two"}']);
  const validation = new FakeValidation([
    { valid: false, findings: [danglingFinding] },
    { valid: true, findings: [] },
  ]);
  const runner = new AgentRunnerService(llm as never, validation as never, fakeRunLog as never, { get: () => false } as never);

  const result = await runner.run({
    agentKey: 'requirements-engineering',
    messages: MESSAGES,
    schema: SCHEMA,
    parse: (content) => JSON.parse(content),
  });

  assert.equal(result.attempts, 2);
  assert.deepEqual(result.output, { fr: 'two' });
  assert.equal(result.retries.length, 1);
  assert.match(result.retries[0].reasons[0], /FR-099/);
  assert.equal(llm.calls.length, 2);

  // The second call carries the original conversation + assistant response + correction.
  const secondCall = llm.calls[1].messages;
  assert.equal(secondCall.length, 4);
  assert.deepEqual(secondCall[0], MESSAGES[0]);
  assert.deepEqual(secondCall[1], MESSAGES[1]);
  assert.equal(secondCall[2].role, 'assistant');
  assert.equal(secondCall[2].content, '{"fr":"one"}');
  assert.equal(secondCall[3].role, 'user');
  assert.match(secondCall[3].content, /FR-099/);
  assert.match(secondCall[3].content, /resubmit the complete output/);
});

test('cap of 2 retries halts the agent with a structured error, not partial data', async () => {
  const llm = new FakeLlm(['{}', '{}', '{}']);
  const validation = new FakeValidation([
    { valid: false, findings: [danglingFinding] },
    { valid: false, findings: [danglingFinding] },
    { valid: false, findings: [danglingFinding] },
  ]);
  const runner = new AgentRunnerService(llm as never, validation as never, fakeRunLog as never, { get: () => false } as never);

  await assert.rejects(
    runner.run({
      agentKey: 'requirements-engineering',
      messages: MESSAGES,
      schema: SCHEMA,
      parse: (content) => JSON.parse(content),
    }),
    (err: unknown) => {
      assert.ok(err instanceof AgentValidationError);
      assert.equal(err.agentKey, 'requirements-engineering');
      assert.equal(err.attempts, 3);
      assert.equal(err.retries.length, 3);
      assert.equal(err.retries[2].attempt, 3);
      assert.equal(err.finalFindings.length, 1);
      return true;
    },
  );

  // 1 initial call + 2 retries, no more.
  assert.equal(llm.calls.length, 3);
});

test('parse failure is treated as a validation failure and retried with feedback', async () => {
  const llm = new FakeLlm(['not-json', '{"ok":true}']);
  const validation = new FakeValidation([{ valid: true, findings: [] }]);
  const runner = new AgentRunnerService(llm as never, validation as never, fakeRunLog as never, { get: () => false } as never);

  const result = await runner.run({
    agentKey: 'discovery',
    messages: MESSAGES,
    schema: SCHEMA,
    parse: (content) => JSON.parse(content),
  });

  assert.equal(result.attempts, 2);
  assert.match(result.retries[0].reasons[0], /failed to parse/i);
  assert.equal(llm.calls[1].messages[3].content.includes('failed to parse'), true);
});

test('valid first response short-circuits with one attempt and no retries', async () => {
  const llm = new FakeLlm(['{"ok":true}']);
  const validation = new FakeValidation([{ valid: true, findings: [] }]);
  const runner = new AgentRunnerService(llm as never, validation as never, fakeRunLog as never, { get: () => false } as never);

  const result = await runner.run({
    agentKey: 'discovery',
    messages: MESSAGES,
    schema: SCHEMA,
    parse: (content) => JSON.parse(content),
  });

  assert.equal(result.attempts, 1);
  assert.equal(result.retries.length, 0);
  assert.equal(llm.calls.length, 1);
});

test('token usage is summed across attempts', async () => {
  const llm = new FakeLlm(['{"fr":"one"}', '{"fr":"two"}']);
  const validation = new FakeValidation([
    { valid: false, findings: [danglingFinding] },
    { valid: true, findings: [] },
  ]);
  const runner = new AgentRunnerService(llm as never, validation as never, fakeRunLog as never, { get: () => false } as never);

  const result = await runner.run({
    agentKey: 'requirements-engineering',
    messages: MESSAGES,
    schema: SCHEMA,
    parse: (content) => JSON.parse(content),
  });

  assert.equal(result.tokens.inputTokens, 20);
  assert.equal(result.tokens.outputTokens, 10);
  assert.equal(result.tokens.model, 'fake-model');
});

test('buildCorrectionMessage lists every specific failure', () => {
  const message = buildCorrectionMessage([
    danglingFinding,
    {
      code: 'INVALID_ENUM',
      field: 'riskRating',
      value: 'Severe',
      message: "Field 'riskRating' must be one of LOW|MEDIUM|HIGH|CRITICAL, got 'Severe'.",
    },
  ]);

  assert.match(message, /FR-099/);
  assert.match(message, /riskRating/);
  assert.match(message, /resubmit the complete output/);
});

test('explicit lowConfidenceFlags from the output are persisted per project', async () => {
  const llm = new FakeLlm(['{"lowConfidenceFlags":[{"field":"screens","reason":"thin input"}]}']);
  const validation = new FakeValidation([{ valid: true, findings: [] }]);
  const logged: Array<unknown[]> = [];
  const runLog = {
    log: async () => undefined,
    logRetry: async () => undefined,
    logValidationFailure: async () => undefined,
    logPadding: async () => undefined,
    logLowConfidence: async (...args: unknown[]) => {
      logged.push(args);
    },
  };
  const runner = new AgentRunnerService(llm as never, validation as never, runLog as never, { get: () => false } as never);

  await runner.run({
    agentKey: 'ux-design',
    projectId: 'p-1',
    messages: MESSAGES,
    schema: SCHEMA,
    parse: (content) => JSON.parse(content),
  });

  assert.equal(logged.length, 1);
  assert.equal(logged[0][0], 'p-1');
  assert.equal(logged[0][1], 'ux-design');
  assert.match(String(logged[0][2]), /screens/);
  const data = logged[0][3] as { field: string; reason: string };
  assert.equal(data.field, 'screens');
});
