import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentDriftError, DocumentRunnerService } from './document-runner.service';
import type { LLMMessage } from '../llm/llm.service';

class FakeLlm {
  calls: LLMMessage[][] = [];
  contents: string[];

  constructor(contents: string[]) {
    this.contents = contents;
  }

  async generateText(messages: LLMMessage[]) {
    this.calls.push([...messages]);
    return { content: this.contents.shift() ?? '', inputTokens: 1, outputTokens: 1, model: 'fake' };
  }
}

const fakeRunLog = {
  log: async () => undefined,
  logRetry: async () => undefined,
  logValidationFailure: async () => undefined,
  logPadding: async () => undefined,
  logLowConfidence: async () => undefined,
};

const MESSAGES: LLMMessage[] = [
  { role: 'system', content: 'system' },
  { role: 'user', content: 'user' },
];

const SOURCE_ITEMS = [{ externalId: 'FR-001' }, { externalId: 'FR-002' }, { externalId: 'FR-003' }];

test('missing source IDs trigger a correction request, then the retry is checked', async () => {
  const llm = new FakeLlm([
    '# FRD\n\n- FR-001\n- FR-002', // FR-003 missing
    '# FRD\n\n- FR-001\n- FR-002\n- FR-003',
  ]);
  const runner = new DocumentRunnerService(llm as never, fakeRunLog as never);

  const result = await runner.generateDocument({
    agentKey: 'frd',
    projectId: 'p-1',
    messages: MESSAGES,
    knowledgeItems: SOURCE_ITEMS,
  });

  assert.equal(result.attempts, 2);
  assert.equal(llm.calls.length, 2);
  // Second call carries the original conversation + assistant response + correction listing FR-003.
  const second = llm.calls[1];
  assert.equal(second.length, 4);
  assert.equal(second[2].role, 'assistant');
  assert.equal(second[3].role, 'user');
  assert.match(second[3].content, /FR-003/);
  assert.match(second[3].content, /MUST be included/);
});

test('explicit required IDs override knowledge-item extraction for chunked documents', async () => {
  const llm = new FakeLlm(['# SOW\n\n- FEAT-001']);
  const runner = new DocumentRunnerService(llm as never, fakeRunLog as never);

  const result = await runner.generateDocument({
    agentKey: 'sow',
    projectId: 'p-1',
    messages: MESSAGES,
    knowledgeItems: [{ externalId: 'MOD-001' }, { externalId: 'FEAT-001' }, { externalId: 'FEAT-002' }],
    requiredSourceIds: ['FEAT-001'],
  });

  assert.equal(result.attempts, 1);
  assert.equal(llm.calls.length, 1);
});

test('sow missing IDs do not fail the stage and return the draft content', async () => {
  const llm = new FakeLlm(['# SOW\n\n- FEAT-001']);
  const runner = new DocumentRunnerService(llm as never, fakeRunLog as never);

  const result = await runner.generateDocument({
    agentKey: 'sow',
    projectId: 'p-1',
    messages: MESSAGES,
    knowledgeItems: [{ externalId: 'FEAT-001' }, { externalId: 'FEAT-002' }],
    requiredSourceIds: ['FEAT-001', 'FEAT-002'],
  });

  assert.equal(result.attempts, 1);
  assert.equal(result.content, '# SOW\n\n- FEAT-001');
});

test('persistent missing IDs reject the document after the retry cap', async () => {
  const llm = new FakeLlm(['# FRD\n\n- FR-001', '# FRD\n\n- FR-001', '# FRD\n\n- FR-001']);
  const runner = new DocumentRunnerService(llm as never, fakeRunLog as never);

  await assert.rejects(
    runner.generateDocument({
      agentKey: 'frd',
      projectId: 'p-1',
      messages: MESSAGES,
      knowledgeItems: SOURCE_ITEMS,
    }),
    (err: unknown) => {
      assert.ok(err instanceof DocumentDriftError);
      assert.equal(err.agentKey, 'frd');
      assert.equal(err.attempts, 3);
      assert.ok(err.missing.includes('FR-002'));
      assert.ok(err.missing.includes('FR-003'));
      return true;
    },
  );
  assert.equal(llm.calls.length, 3);
});

test('complete documents return on the first attempt without retries', async () => {
  const llm = new FakeLlm(['# FRD\n\n- FR-001\n- FR-002\n- FR-003']);
  const runner = new DocumentRunnerService(llm as never, fakeRunLog as never);

  const result = await runner.generateDocument({
    agentKey: 'frd',
    projectId: 'p-1',
    messages: MESSAGES,
    knowledgeItems: SOURCE_ITEMS,
  });

  assert.equal(result.attempts, 1);
  assert.equal(llm.calls.length, 1);
});

test('agents without drift patterns (compiler) skip the check', async () => {
  const llm = new FakeLlm(['# Compiled document with no IDs']);
  const runner = new DocumentRunnerService(llm as never, fakeRunLog as never);

  const result = await runner.generateDocument({
    agentKey: 'compiler',
    projectId: 'p-1',
    messages: MESSAGES,
    knowledgeItems: [],
  });

  assert.equal(result.attempts, 1);
  assert.equal(result.content, '# Compiled document with no IDs');
});

test('invented IDs are logged but do not block the document', async () => {
  const llm = new FakeLlm(['# FRD\n\n- FR-001\n- FR-002\n- FR-003\n- FR-099']);
  const logged: Array<unknown[]> = [];
  const runLog = {
    log: async (...args: unknown[]) => {
      logged.push(args);
    },
    logRetry: async () => undefined,
    logValidationFailure: async () => undefined,
    logPadding: async () => undefined,
    logLowConfidence: async () => undefined,
  };
  const runner = new DocumentRunnerService(llm as never, runLog as never);

  const result = await runner.generateDocument({
    agentKey: 'frd',
    projectId: 'p-1',
    messages: MESSAGES,
    knowledgeItems: SOURCE_ITEMS,
  });

  assert.equal(result.attempts, 1);
  assert.equal(logged.length, 1);
  assert.equal(logged[0][2], 'drift');
  const data = logged[0][4] as { invented: string[] };
  assert.deepEqual(data.invented, ['FR-099']);
});
