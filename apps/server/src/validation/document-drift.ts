/**
 * Drift check between generated markdown documents and their source JSON
 * (document-generation prompts doc). The doc generators render markdown, so
 * P0-3's schema validation can't apply — instead we extract every ID token
 * matching the document's ID patterns and compare against the source ID set:
 *  - IDs in the markdown that don't exist in the source = invention/drift
 *  - source IDs missing from the markdown = silent omission
 * This flags (doesn't block) how closely the document tracks the source JSON:
 * invented IDs may be deliberate inferences under the enterprise generation
 * prompts, but a rising count is a useful quality signal for review.
 */

/**
 * Patterns list only the IDs each fixed prompt explicitly requires preserving:
 * - FRD: all FRs (the enterprise FRD has no user-stories section)
 * - User Stories: all stories (unlinked FRs legitimately never appear)
 * - HLD: component IDs only (APIs are cross-referenced, not enumerated;
 *   infra/event/observability sections don't require ID tags)
 * - DB Design: table IDs only (relationships/constraints/indexes are rendered
 *   narratively, not ID-tagged)
 * - API Spec: endpoint IDs only (components are context, not rendered)
 * - SOW: feature + module IDs only (every feature must be listed)
 */
/** Keyed by doc-generator agent key (the DocumentRunnerService looks these up). */
export const DOCUMENT_ID_PATTERNS: Record<string, string[]> = {
  frd: ['FR-\\d+', 'FEAT-\\d+', 'MOD-\\d+'],
  'user-stories': ['US-\\d+'],
  'tech-arch': ['CMP-\\d+'],
  'db-design': ['TBL-\\d+'],
  'api-spec': ['API-SPEC-\\d+'],
  sow: ['FEAT-\\d+', 'MOD-\\d+'],
};

export function extractDocumentIds(text: string, patterns: string[]): Set<string> {
  const ids = new Set<string>();
  for (const pattern of patterns) {
    const re = new RegExp(pattern, 'g');
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      ids.add(match[0]);
    }
  }
  return ids;
}

export interface DocumentDriftResult {
  /** IDs present in the markdown but not in the source JSON. */
  invented: string[];
  /** Source IDs absent from the markdown (silent omission). */
  missing: string[];
  ok: boolean;
}

export function checkDocumentDrift(args: {
  markdown: string;
  sourceIds: Set<string>;
  patterns: string[];
}): DocumentDriftResult {
  const markdownIds = extractDocumentIds(args.markdown, args.patterns);
  const invented = [...markdownIds].filter((id) => !args.sourceIds.has(id)).sort();
  const missing = [...args.sourceIds].filter((id) => !markdownIds.has(id)).sort();
  return { invented, missing, ok: invented.length === 0 && missing.length === 0 };
}
