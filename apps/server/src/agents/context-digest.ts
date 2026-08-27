import type { KnowledgeItemSummary } from './types';

export interface AgentDigestConfig {
  /**
   * Upstream agents (by agent key) whose output is passed in full detail to
   * this consumer. `'*'` keeps everything full (used by document stages that
   * assemble the final artifacts). Agents not listed are digested.
   */
  immediateUpstream: readonly string[];
}

/**
 * P1-1: explicit per-agent mapping of immediate (full detail) vs distant
 * (digest) upstream agents. Deliberately a config table, not per-call logic.
 *
 * Rule of thumb: the 1-2 directly preceding agents pass full detail; anything
 * farther upstream is reduced to `externalId` + `title` + a one-line
 * description. Validation/debate take a global digest view by design.
 */
export const AGENT_DIGEST_CONFIG: Record<string, AgentDigestConfig> = {
  discovery: { immediateUpstream: [] },
  research: { immediateUpstream: ['discovery'] },
  'business-analysis': { immediateUpstream: ['discovery', 'research'] },
  'product-analysis': { immediateUpstream: ['business-analysis', 'research'] },
  'requirements-engineering': { immediateUpstream: ['product-analysis', 'business-analysis'] },
  'ux-design': { immediateUpstream: ['requirements-engineering', 'product-analysis'] },
  'data-architecture': { immediateUpstream: ['ux-design', 'requirements-engineering'] },
  'ai-architecture': { immediateUpstream: ['data-architecture', 'ux-design'] },
  'solution-architecture': {
    immediateUpstream: ['ai-architecture', 'data-architecture', 'ux-design'],
  },
  'security-review': {
    immediateUpstream: ['solution-architecture', 'ai-architecture', 'data-architecture'],
  },
  'qa-planning': { immediateUpstream: ['security-review', 'solution-architecture'] },
  estimation: { immediateUpstream: ['qa-planning', 'security-review'] },
  validation: { immediateUpstream: [] },
  debate: { immediateUpstream: [] },
  // Document stages target specific domain sources; distant items are digested to conserve context.
  compilation: {
    immediateUpstream: [
      'requirements-engineering',
      'solution-architecture',
      'product-analysis',
      'business-analysis',
      'qa-planning',
      'estimation',
    ],
  },
  'frd-generation': {
    immediateUpstream: [
      'requirements-engineering',
      'product-analysis',
      'business-analysis',
      'ux-design',
    ],
  },
  'user-stories-generation': {
    immediateUpstream: ['product-analysis', 'requirements-engineering', 'ux-design'],
  },
  'tech-arch-generation': {
    immediateUpstream: [
      'solution-architecture',
      'ai-architecture',
      'data-architecture',
      'security-review',
    ],
  },
  'db-design-generation': {
    immediateUpstream: ['data-architecture', 'requirements-engineering', 'solution-architecture'],
  },
  'api-spec-generation': {
    immediateUpstream: ['solution-architecture', 'data-architecture', 'requirements-engineering'],
  },
  'sow-generation': {
    immediateUpstream: [
      'product-analysis',
      'estimation',
      'business-analysis',
      'requirements-engineering',
    ],
  },
  'build-prompt-generation': {
    immediateUpstream: [
      'compilation',
      'requirements-engineering',
      'solution-architecture',
      'product-analysis',
    ],
  },
  'gap-analysis': {
    immediateUpstream: ['*'],
  },
};

export interface DigestOptions {
  /** Max length of the one-line digest description (default 120). */
  maxDescriptionLength?: number;
}

function toOneLine(text: string | null, max: number): string | null {
  if (!text) return text;
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max - 1)}…`;
}

/**
 * Trim upstream knowledge items for a given consumer agent:
 * - items produced by an immediate upstream agent pass through untouched;
 * - everything else is reduced to `externalId`/`title`/one-line description.
 * Unknown consumers (no config entry) pass everything through untouched.
 */
export function digestKnowledgeItems(
  items: KnowledgeItemSummary[],
  consumerAgentKey: string,
  options?: DigestOptions,
): KnowledgeItemSummary[] {
  const maxDescription = options?.maxDescriptionLength ?? 120;
  const config = AGENT_DIGEST_CONFIG[consumerAgentKey];
  if (!config || config.immediateUpstream.includes('*')) return items;

  const immediate = new Set(config.immediateUpstream);
  return items.map((item) => {
    // RKB stores source as `${agentKey}` or `${agentKey}::${sourceCategory}`.
    const producer = (item.source ?? '').split('::')[0] ?? '';
    if (immediate.has(producer)) return item;
    return {
      ...item,
      description: toOneLine(item.description, maxDescription),
    };
  });
}
