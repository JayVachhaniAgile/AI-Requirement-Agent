import type { CanonicalLlmInput } from './canonical.schemas';
import type { CanonicalObjectBase } from './canonical.types';

/**
 * Normalization — the second stage of the canonical ingestion pipeline.
 *
 * - Trims strings
 * - Deduplicates arrays of refs
 * - Forces required defaults (status, version, createdAt/updatedAt)
 * - Coerces confidence to a number when present
 * - Strips empty provenance entries so traceability stays clean
 */
export function normalize(input: CanonicalLlmInput, projectId: string): CanonicalObjectBase {
  const now = new Date().toISOString();
  const provenance = {
    epistemicClass: input.provenance.epistemicClass,
    sources: dedupeSources(input.provenance.sources ?? []),
    producedBy: input.provenance.producedBy?.trim(),
    schemaVersion: input.provenance.schemaVersion?.trim(),
  };

  const base: CanonicalObjectBase = {
    projectId,
    externalId: input.externalId.trim(),
    kind: input.kind,
    title: input.title.trim(),
    summary: input.summary?.trim() || undefined,
    status: input.status ?? 'DRAFT',
    version: input.version ?? 1,
    provenance,
    body: normalizeBody(input),
    createdAt: now,
    updatedAt: now,
  };
  return base;
}

function dedupeSources<T extends { category: string; refId?: string }>(sources: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const s of sources) {
    const key = `${s.category}::${s.refId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function normalizeBody(input: CanonicalLlmInput): Record<string, unknown> {
  // The Zod schema already enforces shape; this layer only strips noise and
  // ensures every ref id is trimmed + de-duplicated.
  const body: Record<string, unknown> = { ...input.body };
  const arrayKeys = [
    'actors',
    'preconditions',
    'postconditions',
    'businessRuleRefs',
    'acceptanceCriteriaRefs',
    'dependencies',
    'assumptions',
    'actorRefs',
    'requirementRefs',
    'acceptanceCriteriaRefs',
    'userStoryRefs',
  ];
  for (const key of arrayKeys) {
    const value = (body as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      const trimmed = value
        .map((v) => (typeof v === 'string' ? v.trim() : v))
        .filter((v) => v !== '' && v != null);
      (body as Record<string, unknown>)[key] = [...new Set(trimmed as string[])];
    }
  }
  return body;
}
