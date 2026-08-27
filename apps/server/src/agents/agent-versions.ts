/**
 * P2-4: Prompt/schema versioning.
 *
 * Every agent is tagged with a manual `promptVersion` (bump it whenever the
 * agent's system prompt changes) and a `schemaVersion` auto-derived from a
 * content hash of the agent's structured-output JSON Schema + validation
 * config. Both are stored on every run-log row so a quality regression can be
 * traced to the exact prompt/schema revision that produced it.
 */

import { AGENT_STRUCTURED_SCHEMAS } from '../llm/agent-json-schemas';
import { AGENT_VALIDATION_CONFIGS } from '../validation/agent-validation.config';

/**
 * Manual prompt versions. Keep in sync with the SYSTEM prompts in each agent
 * service — bump the tag whenever the prompt content changes.
 */
export const AGENT_PROMPT_VERSIONS: Record<string, string> = {
  discovery: 'v1',
  research: 'v1',
  'business-analysis': 'v1',
  'product-analysis': 'v1',
  'requirements-engineering': 'v1',
  'ux-design': 'v1',
  'data-architecture': 'v1',
  'ai-architecture': 'v1',
  'solution-architecture': 'v1',
  'security-review': 'v1',
  'qa-planning': 'v1',
  estimation: 'v1',
  validation: 'v1',
  debate: 'v1',
  'gap-analysis': 'v1',
  'gap-patch': 'v1',
};

/** FNV-1a 32-bit content hash — deterministic, dependency-free. */
export function contentHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Auto-derived schema version from the JSON Schema + validation contract. */
export function getSchemaVersion(agentKey: string): string {
  const schema = AGENT_STRUCTURED_SCHEMAS[agentKey]?.schema;
  const validation = AGENT_VALIDATION_CONFIGS[agentKey];
  return contentHash(JSON.stringify({ schema, validation }));
}

export interface AgentVersions {
  agentKey: string;
  promptVersion: string;
  schemaVersion: string;
}

export function getAgentVersions(agentKey: string): AgentVersions {
  return {
    agentKey,
    promptVersion: AGENT_PROMPT_VERSIONS[agentKey] ?? 'v1',
    schemaVersion: getSchemaVersion(agentKey),
  };
}
