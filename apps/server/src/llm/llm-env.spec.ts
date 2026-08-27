import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLlmConfig } from './llm-env';

function env(map: Record<string, string | undefined>) {
  return (key: string) => map[key];
}

test('generic LLM_* vars drive ollama without provider-specific keys', () => {
  const cfg = resolveLlmConfig(
    env({
      LLM_PROVIDER: 'ollama',
      LLM_MODEL: 'llama3.1',
      LLM_BASE_URL: 'http://localhost:11434/v1',
    }),
  );
  assert.equal(cfg.provider, 'ollama');
  assert.equal(cfg.model, 'llama3.1');
  assert.equal(cfg.baseURL, 'http://localhost:11434/v1');
  assert.equal(cfg.apiKey, 'ollama');
});

test('generic LLM_* vars drive openai', () => {
  const cfg = resolveLlmConfig(
    env({
      LLM_PROVIDER: 'openai',
      LLM_API_KEY: 'sk-test',
      LLM_MODEL: 'gpt-4o-mini',
    }),
  );
  assert.equal(cfg.provider, 'openai');
  assert.equal(cfg.model, 'gpt-4o-mini');
  assert.equal(cfg.apiKey, 'sk-test');
  assert.equal(cfg.baseURL, undefined);
});

test('anthropic alias maps to custom and requires LLM_BASE_URL', () => {
  const cfg = resolveLlmConfig(
    env({
      LLM_PROVIDER: 'anthropic',
      LLM_API_KEY: 'sk-ant-test',
      LLM_MODEL: 'claude-3-5-sonnet',
      LLM_BASE_URL: 'http://localhost:20128/v1',
    }),
  );
  assert.equal(cfg.provider, 'custom');
  assert.equal(cfg.model, 'claude-3-5-sonnet');
  assert.equal(cfg.apiKey, 'sk-ant-test');
  assert.equal(cfg.baseURL, 'http://localhost:20128/v1');
});

test('legacy OLLAMA_* keys still resolve', () => {
  const cfg = resolveLlmConfig(
    env({
      LLM_PROVIDER: 'ollama',
      OLLAMA_BASE_URL: 'http://localhost:11434/v1',
      OLLAMA_MODEL: 'llama3.1',
    }),
  );
  assert.equal(cfg.provider, 'ollama');
  assert.equal(cfg.model, 'llama3.1');
  assert.equal(cfg.baseURL, 'http://localhost:11434/v1');
});

test('LLM_MODEL wins over legacy provider model keys', () => {
  const cfg = resolveLlmConfig(
    env({
      LLM_PROVIDER: 'groq',
      LLM_API_KEY: 'gsk-test',
      LLM_MODEL: 'my-model',
      GROQ_MODEL: 'legacy-model',
    }),
  );
  assert.equal(cfg.model, 'my-model');
  assert.equal(cfg.provider, 'groq');
});

test('custom without base URL throws a clear error', () => {
  assert.throws(
    () =>
      resolveLlmConfig(
        env({
          LLM_PROVIDER: 'custom',
          LLM_MODEL: 'x',
        }),
      ),
    /LLM_BASE_URL is required/,
  );
});

test('openai without api key throws', () => {
  assert.throws(
    () =>
      resolveLlmConfig(
        env({
          LLM_PROVIDER: 'openai',
          LLM_MODEL: 'gpt-4o',
        }),
      ),
    /LLM_API_KEY is required/,
  );
});
