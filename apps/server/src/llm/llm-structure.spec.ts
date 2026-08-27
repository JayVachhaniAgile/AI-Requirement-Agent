import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildForcedToolParams,
  buildJsonSchemaParams,
  buildSchemaHint,
  extractToolCallArguments,
  LlmService,
} from './llm.service';
import { AGENT_STRUCTURED_SCHEMAS } from './agent-json-schemas';
import { AGENT_VALIDATION_CONFIGS } from '../validation/agent-validation.config';

const MESSAGES = [
  { role: 'system' as const, content: 'system' },
  { role: 'user' as const, content: 'user' },
];

test('forced tool params pin model to a single submit_* tool', () => {
  const params = buildForcedToolParams({
    model: 'gpt-4o',
    messages: MESSAGES,
    maxTokens: 4096,
    toolName: 'submit_discovery_output',
    schema: { type: 'object' },
  });

  assert.equal(params.model, 'gpt-4o');
  assert.equal(params.max_tokens, 4096);
  assert.deepEqual(params.messages, MESSAGES);
  assert.equal(params.tools?.length, 1);
  assert.equal(params.tools?.[0].type, 'function');
  assert.equal(params.tools?.[0].function.name, 'submit_discovery_output');
  assert.deepEqual(params.tools?.[0].function.parameters, { type: 'object' });
  assert.deepEqual(params.tool_choice, {
    type: 'function',
    function: { name: 'submit_discovery_output' },
  });
});

test('json_schema params use response_format with the agent schema', () => {
  const params = buildJsonSchemaParams({
    model: 'gpt-4o',
    messages: MESSAGES,
    maxTokens: 4096,
    toolName: 'submit_discovery_output',
    schema: { type: 'object' },
  });

  assert.equal(params.max_tokens, 4096);
  assert.equal(params.response_format?.type, 'json_schema');
  const jsonSchema = params.response_format as {
    json_schema?: { name?: string; schema?: unknown; strict?: boolean };
  };
  assert.equal(jsonSchema.json_schema?.name, 'submit_discovery_output');
  assert.deepEqual(jsonSchema.json_schema?.schema, { type: 'object' });
  assert.equal(jsonSchema.json_schema?.strict, false);
});

test('tool call arguments are returned verbatim as the entire payload', () => {
  const response = {
    choices: [
      {
        message: {
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'submit_discovery_output',
                arguments: '{"ideaInterpretation":"Idea"}',
              },
            },
          ],
        },
      },
    ],
  };

  assert.equal(extractToolCallArguments(response), '{"ideaInterpretation":"Idea"}');
});

test('Groq prompts are not truncated just because they are long', () => {
  const service = new LlmService(
    {
      get: (key: string) => {
        if (key === 'LLM_PROVIDER') return 'groq';
        if (key === 'GROQ_API_KEY') return 'test-key';
        return undefined;
      },
    } as never,
    {} as never,
  );

  const messages = [
    { role: 'system' as const, content: 'system '.repeat(20_000) },
    { role: 'user' as const, content: 'user '.repeat(20_000) },
  ];

  const fitted = (service as unknown as {
    fitMessages: (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) => Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }>;
  }).fitMessages(messages);

  assert.equal(fitted.length, messages.length);
  assert.equal(fitted[0].content, messages[0].content);
  assert.equal(fitted[1].content, messages[1].content);
});

test('Groq structured agent requests stay open-ended without a hard ceiling', () => {
  const service = new LlmService(
    {
      get: (key: string) => {
        if (key === 'LLM_PROVIDER') return 'groq';
        if (key === 'GROQ_API_KEY') return 'test-key';
        return undefined;
      },
    } as never,
    {} as never,
  );

  const params = (service as unknown as { buildParams?: typeof buildForcedToolParams }).buildParams?.({
    model: 'gpt-4o',
    messages: MESSAGES,
    toolName: 'submit_discovery_output',
    schema: { type: 'object' },
  });

  assert.equal(params?.max_tokens, undefined);
});

test('custom provider resolves an OpenAI-compatible base URL and model', () => {
  const service = new LlmService(
    {
      get: (key: string) => {
        if (key === 'LLM_PROVIDER') return 'custom';
        if (key === 'CUSTOM_LLM_BASE_URL') return 'http://localhost:20128/v1';
        if (key === 'CUSTOM_LLM_MODEL') return 'custom-model';
        return undefined;
      },
    } as never,
    {} as never,
  );

  assert.equal((service as unknown as { provider: string }).provider, 'custom');
  assert.equal((service as unknown as { model: string }).model, 'custom-model');
  assert.equal((service as unknown as { supportsJsonMode: boolean }).supportsJsonMode, true);
  assert.equal((service as unknown as { supportsForcedTools: boolean }).supportsForcedTools, false);
  assert.equal((service as unknown as { supportsJsonSchemaMode: boolean }).supportsJsonSchemaMode, true);
});

test('no tool call in response yields null (caller falls back)', () => {
  assert.equal(extractToolCallArguments({ choices: [{ message: { content: 'plain' } }] }), null);
  assert.equal(extractToolCallArguments({ choices: [] }), null);
  assert.equal(extractToolCallArguments({}), null);
});

test('every structured workflow agent has a registered schema with a submit_* tool', () => {
  for (const agentKey of Object.keys(AGENT_VALIDATION_CONFIGS)) {
    const entry = AGENT_STRUCTURED_SCHEMAS[agentKey];
    assert.ok(entry, `missing structured schema for agent '${agentKey}'`);
    assert.equal(entry.toolName, `submit_${agentKey.replace(/-/g, '_')}_output`);
    assert.equal(entry.schema.type, 'object');
    assert.ok(
      Array.isArray(entry.schema.required),
      `schema for '${agentKey}' missing required list`,
    );
  }
});

test('all registered schemas are valid, serializable JSON Schema objects', () => {
  for (const [agentKey, entry] of Object.entries(AGENT_STRUCTURED_SCHEMAS)) {
    assert.doesNotThrow(
      () => JSON.stringify(entry.schema),
      `schema '${agentKey}' not serializable`,
    );
    assert.equal(entry.schema.type, 'object');
    const required = entry.schema.required as string[];
    for (const field of required) {
      assert.ok(
        (entry.schema.properties as Record<string, unknown>)[field],
        `schema '${agentKey}': required field '${field}' missing from properties`,
      );
    }
  }
});

test('schema hint lists the real top-level keys from schema.properties', () => {
  const hint = buildSchemaHint({
    type: 'object',
    properties: {
      ideaInterpretation: { type: 'string' },
      problemStatement: { type: 'string' },
      confirmedFacts: { type: 'array' },
    },
    required: ['ideaInterpretation', 'problemStatement', 'confirmedFacts'],
  });

  assert.match(hint, /ideaInterpretation, problemStatement, confirmedFacts/);
  assert.match(hint, /Required fields: ideaInterpretation, problemStatement, confirmedFacts/);
});

test('empty schema hint when no properties are declared', () => {
  assert.equal(buildSchemaHint({ type: 'object' }), '');
});
