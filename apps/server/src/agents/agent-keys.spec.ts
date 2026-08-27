import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AGENT_VALIDATION_CONFIGS } from '../validation/agent-validation.config';
import { AGENT_STRUCTURED_SCHEMAS } from '../llm/agent-json-schemas';

/**
 * Guards against the runner-call agentKey drifting from the workflow key
 * (e.g. 'business-analyst' vs 'business-analysis'): every key passed to
 * AgentRunnerService.run() must have a registered validation config + schema.
 */
test('every runner-call agentKey in agent services is a registered workflow key', () => {
  const dir = join(process.cwd(), 'src', 'agents');
  const files = readdirSync(dir).filter((f) => f.endsWith('.service.ts'));
  const problems: string[] = [];

  for (const file of files) {
    const src = readFileSync(join(dir, file), 'utf8');
    const regex = /await this\.agentRunner\.run\(\{[\s\S]*?agentKey: '([^']+)'/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(src)) !== null) {
      const key = match[1];
      if (!AGENT_VALIDATION_CONFIGS[key] || !AGENT_STRUCTURED_SCHEMAS[key]) {
        problems.push(`${file}: unregistered agentKey '${key}'`);
      }
    }
  }

  assert.deepEqual(problems, []);
});
