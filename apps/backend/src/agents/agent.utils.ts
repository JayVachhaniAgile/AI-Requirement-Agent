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

/**
 * Add source attribution fields to knowledge items.
 * This standardizes how agents provide evidence, reasoning, and source info.
 */
export function withSourceAttribution<K extends Record<string, unknown>>(
  items: K[],
  options: {
    agentKey: string;
    defaultSourceCategory?: 'prompt' | 'document' | 'research' | 'ai_analysis' | 'user_input' | 'debate';
  },
): (K & { sourceCategory?: string; evidence?: string; reasoning?: string; confidence?: number })[] {
  return items.map((item) => ({
    ...item,
    sourceCategory: options.defaultSourceCategory ?? 'ai_analysis',
    reasoning: (item.reasoning as string) ?? `Extracted by ${options.agentKey} agent`,
    evidence: (item.evidence as string) ?? undefined,
    confidence: (item.confidence as number) ?? Math.round(
        [65,
          item.evidence ? 12 : 0,
          item.reasoning ? 8 : 0,
          (item.description as string)?.length > 100 ? 7 : 0,
          (item.title as string)?.length > 20 ? 5 : 0,
        ].reduce((a, b) => a + b, 0)
      ),
  }));
}

/**
 * Zod schema for evidence/reasoning in agent item schemas.
 */
export const EvidenceFields = {
  evidence: z.string().optional(),
  reasoning: z.string().optional(),
};

/**
 * Safely extract JSON from LLM responses that may include extra text.
 */
export function safeJsonParse(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[1].trim()); } catch { /* fall through */ }
    }
    const braceStart = raw.indexOf('{');
    const braceEnd = raw.lastIndexOf('}');
    if (braceStart >= 0 && braceEnd > braceStart) {
      try { return JSON.parse(raw.slice(braceStart, braceEnd + 1)); } catch { /* fall through */ }
    }
    const bracketStart = raw.indexOf('[');
    const bracketEnd = raw.lastIndexOf(']');
    if (bracketStart >= 0 && bracketEnd > bracketStart) {
      try { return JSON.parse(raw.slice(bracketStart, bracketEnd + 1)); } catch { /* fall through */ }
    }
  }
  return {};
}
