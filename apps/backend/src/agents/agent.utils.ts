import { z } from 'zod';
import type { KnowledgeItemSummary } from './types';

/** Shared Zod-friendly item shape used across agents. */
export const ITEM_FIELDS = '{externalId, title, description}';

/** Resilient item schema — tolerates partial LLM JSON (Groq etc.). */
export const AgentItemSchema = z.object({
  externalId: z.string().default(''),
  title: z.string().default('Untitled'),
  description: z.string().default(''),
});

export const AgentItemArray = z.array(AgentItemSchema).default([]);

export function ensureItemIds<T extends { externalId: string; title: string; description: string }>(
  items: T[],
  prefix: string,
): T[] {
  return items.map((item, i) => ({
    ...item,
    externalId: item.externalId.trim() || `${prefix}-${String(i + 1).padStart(3, '0')}`,
    title: item.title.trim() || 'Untitled',
    description: item.description.trim(),
  }));
}

export function ensureSummary(value: string | undefined, fallback: string): string {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export function formatKnowledge(
  items: KnowledgeItemSummary[],
  types?: string[],
  maxDesc = 160,
  maxItems?: number,
): string {
  let filtered = types ? items.filter((i) => types.includes(i.type)) : items;
  if (maxItems !== undefined && filtered.length > maxItems) {
    filtered = filtered.slice(0, maxItems);
  }
  return filtered
    .map(
      (i) =>
        `[${i.type}] ${i.externalId ?? '-'} ${i.title}: ${(i.description ?? '').substring(0, maxDesc)}`,
    )
    .join('\n');
}

/**
 * Compact knowledge for late-pipeline agents (critic/compiler) so prompts
 * stay under Groq free-tier TPM / request limits.
 */
export function compactKnowledgeSummary(
  items: KnowledgeItemSummary[],
  options?: { maxChars?: number; maxDesc?: number; maxPerType?: number },
): string {
  const maxChars = options?.maxChars ?? 10_000;
  const maxDesc = options?.maxDesc ?? 90;
  const maxPerType = options?.maxPerType ?? 8;

  const byType = new Map<string, KnowledgeItemSummary[]>();
  for (const item of items) {
    const list = byType.get(item.type) ?? [];
    list.push(item);
    byType.set(item.type, list);
  }

  // Prefer high-signal summary / design types first.
  const priorityTypes = [
    'DISCOVERY_SUMMARY',
    'RESEARCH_SUMMARY',
    'BA_SUMMARY',
    'PRODUCT_VISION',
    'MVP_SCOPE',
    'SCOPE',
    'UX_SUMMARY',
    'DATABASE_DESIGN',
    'AI_ARCHITECTURE',
    'SOLUTION_ARCHITECTURE',
    'SECURITY_REPORT',
    'QA_PLAN',
    'ESTIMATION_REPORT',
    'FUNCTIONAL_REQUIREMENT',
    'USER_STORY',
    'FEATURE',
    'MODULE',
    'API_SPEC',
    'SCREEN',
    'DB_TABLE',
    'TEST_CASE',
    'THREAT_MODEL',
    'BUSINESS_REQUIREMENT',
    'ASSUMPTION',
    'RISK',
  ];

  const orderedTypes = [
    ...priorityTypes.filter((t) => byType.has(t)),
    ...[...byType.keys()].filter((t) => !priorityTypes.includes(t)).sort(),
  ];

  const inventory = [...byType.entries()]
    .map(([type, list]) => `${type}:${list.length}`)
    .join(', ');

  const parts: string[] = [`Inventory (${items.length} items): ${inventory}`];

  for (const type of orderedTypes) {
    const list = byType.get(type) ?? [];
    const sample = list.slice(0, maxPerType);
    const omitted = list.length - sample.length;
    const block = [
      `## ${type} (${list.length})`,
      ...sample.map(
        (i) =>
          `- ${i.externalId ?? '-'} | ${i.title}${
            i.description ? `: ${i.description.substring(0, maxDesc)}` : ''
          }`,
      ),
      omitted > 0 ? `- … +${omitted} more omitted` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const next = parts.join('\n\n') + '\n\n' + block;
    if (next.length > maxChars) {
      parts.push(`## ${type} truncated (${list.length} items — context budget reached)`);
      break;
    }
    parts.push(block);
  }

  let result = parts.join('\n\n');
  if (result.length > maxChars) {
    result = `${result.slice(0, maxChars)}\n\n[truncated for token budget]`;
  }
  return result;
}

export function buildUserPrompt(
  projectName: string,
  idea: string,
  sections: Array<{ label: string; body: string }>,
  instruction: string,
): string {
  const parts = [
    `Project: ${projectName}`,
    `Original Idea: ${idea}`,
    ...sections.filter((s) => s.body.trim().length > 0).map((s) => `${s.label}:\n${s.body}`),
    instruction,
  ];
  return parts.join('\n\n');
}

/** Rough token estimate (~4 chars/token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
