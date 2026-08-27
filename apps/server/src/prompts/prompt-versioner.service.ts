/**
 * Prompt Versioner — computes deterministic content-hash versions for
 * templates (P2-4 traceability). Reuses the FNV-1a implementation from
 * `agents/agent-versions.ts` for consistency.
 */
import { getSchemaVersion } from '../agents/agent-versions';
import { contentHash } from '../agents/agent-versions';
import type { PromptTemplate } from './template.types';

export interface TemplateVersion {
  promptKey: string;
  promptVersion: string;
  contentHash: string;
  schemaVersion: string | null;
  minor: number;
  patch: string;
}

/**
 * Compute the current version for a prompt template.
 * Version format: `v<MAJOR>.<MINOR>-<patch>` where patch = 8-char hex content hash.
 */
export function getTemplateVersion(template: PromptTemplate): TemplateVersion {
  const compiled = stableSerialize({
    key: template.key,
    kind: template.kind,
    system: serializeParts(template.system),
    user: template.user ? serializeParts(template.user) : null,
    fewShot: template.fewShot ?? [],
    description: template.description ?? '',
  });
  const patch = contentHash(compiled).slice(0, 8);
  const major = template.version?.major ?? 1;
  const minor = template.version?.minor ?? 0;
  const promptVersion = `v${major}.${minor}-${patch}`;
  const agentKey = template.key.startsWith('agent:')
    ? template.key.replace('agent:', '')
    : null;
  const schemaVersion = agentKey ? getSchemaVersion(agentKey) : null;

  return {
    promptKey: template.key,
    promptVersion,
    contentHash: contentHash(compiled),
    schemaVersion,
    minor,
    patch,
  };
}

/** Re-export contentHash for use elsewhere. */
export { contentHash };

// --- internal serialization helpers ---

function serializeParts(parts: unknown): string {
  if (typeof parts === 'function') return parts.toString();
  if (typeof parts === 'string') return parts;
  if (Array.isArray(parts)) {
    return parts.map(serializeParts).join('\n\n');
  }
  return JSON.stringify(parts);
}

function stableSerialize(value: unknown): string {
  if (value === undefined || value === null) return 'null';
  if (typeof value === 'function') return `fn:${value.toString()}`;
  if (typeof value === 'string') return `s:${value}`;
  if (typeof value === 'number' || typeof value === 'boolean') return `p:${String(value)}`;
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${k}:${stableSerialize(v)}`).join(',')}}`;
  }
  return `u:${String(value)}`;
}
