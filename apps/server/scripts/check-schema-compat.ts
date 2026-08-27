/**
 * CI guardrail (P0-1): every agent that participates in structured output
 * must have a registered JSON Schema whose required fields all exist in
 * `properties`. Run with: pnpm --filter @workspace/server check:schema
 *
 * This prevents "model changed → LLM returned an object without the expected
 * keys → every field is undefined" regressions from reaching the pipeline.
 */
import { AGENT_STRUCTURED_SCHEMAS } from '../src/llm/agent-json-schemas';
import { AGENT_VALIDATION_CONFIGS } from '../src/validation/agent-validation.config';
import { MODEL_COMPAT, type StructuredMode } from '../src/llm/model-compat';

const KNOWN_MODES = new Set<StructuredMode>([
  'forced-tools',
  'json-schema',
  'json-object',
  'prompt-only',
]);

const errors: string[] = [];

// 1. Every structured workflow agent has a schema.
for (const agentKey of Object.keys(AGENT_VALIDATION_CONFIGS)) {
  const entry = AGENT_STRUCTURED_SCHEMAS[agentKey];
  if (!entry) {
    errors.push(`agent '${agentKey}' is missing a structured schema`);
    continue;
  }
  if (entry.toolName !== `submit_${agentKey.replace(/-/g, '_')}_output`) {
    errors.push(
      `agent '${agentKey}' toolName '${entry.toolName}' does not match submit_* convention`,
    );
  }
  if (entry.schema.type !== 'object') {
    errors.push(`agent '${agentKey}' schema is not an object schema`);
  }
  const required = entry.schema.required;
  if (!Array.isArray(required) || required.length === 0) {
    errors.push(`agent '${agentKey}' schema has no required field list`);
    continue;
  }
  const properties = (entry.schema.properties ?? {}) as Record<string, unknown>;
  for (const field of required) {
    if (!properties[field]) {
      errors.push(`agent '${agentKey}': required field '${field}' missing from properties`);
    }
  }
}

// 2. Every schema key is serializable (catches non-JSON values like undefined).
for (const [agentKey, entry] of Object.entries(AGENT_STRUCTURED_SCHEMAS)) {
  try {
    JSON.stringify(entry.schema);
  } catch {
    errors.push(`agent '${agentKey}' schema is not JSON-serializable`);
  }
}

// 3. Model-compat modes are valid.
for (const [provider, mode] of Object.entries(MODEL_COMPAT)) {
  if (!KNOWN_MODES.has(mode)) {
    errors.push(`provider '${provider}' maps to unknown mode '${mode}'`);
  }
}

if (errors.length > 0) {
  console.error('Schema compatibility check FAILED:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `Schema compatibility OK: ${Object.keys(AGENT_VALIDATION_CONFIGS).length} agents, ` +
    `${Object.keys(AGENT_STRUCTURED_SCHEMAS).length} schemas, ` +
    `${Object.keys(MODEL_COMPAT).length} provider modes checked.`,
);
