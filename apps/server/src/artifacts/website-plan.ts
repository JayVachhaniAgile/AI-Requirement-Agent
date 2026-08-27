/**
 * Parse the generated build-prompt markdown into a structured website plan,
 * then render a clickable, self-contained HTML mock-up.
 *
 * The plan is built defensively from the prompt — every signal is optional,
 * so a project with sparse knowledge still produces a reasonable website.
 */

export interface WebsiteFeature {
  title: string;
  summary: string;
  icon: string;
}

export interface WebsiteAudience {
  name: string;
  blurb: string;
}

/** A screen from `**Screens to build:**` — becomes a sidebar page. */
export interface WebsiteScreen {
  id: string;
  title: string;
  summary: string;
  /** Widget hints detected from the screen description (map, chat, scores, table, docs, charts…). */
  widgets: string[];
}

/** An API endpoint parsed from `**Endpoints & contracts:**`. */
export interface WebsiteEndpoint {
  method: string;
  path: string;
  summary: string;
}

/** A data entity from `**Entities / tables:**`. */
export interface WebsiteEntity {
  id: string;
  title: string;
  summary: string;
}

export interface WebsitePlan {
  projectName: string;
  tagline: string;
  heroSubtitle: string;
  description: string;
  features: WebsiteFeature[];
  audiences: WebsiteAudience[];
  techs: string[];
  securityHighlights: string[];
  screens: WebsiteScreen[];
  endpoints: WebsiteEndpoint[];
  entities: WebsiteEntity[];
  primaryColor: string;
  accentColor: string;
}

interface ParsedSection {
  title: string;
  bullets: string[];
}

/**
 * A bullet captured with its surrounding context: the `## ` section it lives
 * under and the most recent bold label (e.g. `**Functional requirements
 * (source of truth):**`) that preceded it. The compiler emits sub-sections as
 * bold labels inside a parent `## ` section, so heading-only matching is not
 * enough to find e.g. the FR bullets.
 */
interface ContextBullet {
  heading: string;
  label: string;
  bullet: string;
}

/** Split a markdown document into labelled sections by `## ` headings. */
export function parseSections(markdown: string): ParsedSection[] {
  const bullets = parseContextBullets(markdown);
  const sections: ParsedSection[] = [];
  for (const b of bullets) {
    let section = sections.find((s) => s.title === b.heading);
    if (!section) {
      section = { title: b.heading, bullets: [] };
      sections.push(section);
    }
    section.bullets.push(b.bullet);
  }
  return sections;
}

/** Parse every bullet with its `## ` heading + bold-label context. */
export function parseContextBullets(markdown: string): ContextBullet[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out: ContextBullet[] = [];
  let heading = '';
  let label = '';

  for (const line of lines) {
    const h = /^##\s+(.*)$/.exec(line);
    if (h) {
      heading = h[1].trim();
      label = '';
      continue;
    }
    const trimmed = line.trim();
    // Bold label WITH inline content: "**Idea:** <content>"
    const inlineLabel = /^\*\*([^*]+?)\s*[:：]?\s*\*\*\s*[:：]?\s*(.+)$/.exec(trimmed);
    if (inlineLabel) {
      label = inlineLabel[1].trim();
      out.push({ heading, label, bullet: inlineLabel[2].trim() });
      continue;
    }
    // Standalone bold label: "**Audience / personas:**"
    const boldLabel = /^\*\*([^*]+?)\s*[:：]?\s*\*\*\s*[:：]?\s*$/.exec(trimmed);
    if (boldLabel) {
      label = boldLabel[1].trim();
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      out.push({ heading, label, bullet: bullet[1].trim() });
    }
  }
  return out;
}

/** Find bullets whose `## ` heading OR bold label matches any needle. */
function findBullets(
  markdown: string,
  needles: string[],
  limit: number,
): string[] {
  const lower = needles.map((n) => n.toLowerCase());
  return parseContextBullets(markdown)
    .filter((b) =>
      lower.some(
        (n) =>
          b.heading.toLowerCase().includes(n) ||
          b.label.toLowerCase().includes(n),
      ),
    )
    .map((b) => b.bullet)
    .filter(Boolean)
    .slice(0, limit);
}


/** First N words of a sentence (used for feature card titles). */
function firstWords(text: string, n: number): string {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  return words.slice(0, n).join(' ');
}

/** Strip the leading `**...**: ` wrapper the compiler emits. */
function stripBold(text: string): string {
  return text
    .replace(/^\*\*([^*]+)\*\*\s*[:：]\s*/u, '$1: ')
    .replace(/^\*\*([^*]+)\*\*/u, '$1');
}

/** Strip backtick-wrapped IDs (`FR-001`) from the start of a bullet. */
function stripPrefixIds(text: string): string {
  return text.replace(/^`[^`]+`\s*/, '');
}

/** Slugify the bullet's first ID-like token; falls back to the slugified title. */
function firstId(text: string): string | null {
  const match = /^[`"']([A-Z][A-Z0-9-]+)[`"']/.exec(text);
  return match ? match[1] : null;
}

function pickIconForTitle(title: string): string {
  const t = title.toLowerCase();
  if (/auth|login|sign[- ]?in|onboard/.test(t)) return '🔐';
  if (/pay|billing|subscription|invoice/.test(t)) return '💳';
  if (/notif|alert|message|chat|email/.test(t)) return '🔔';
  if (/report|analytic|dashboard|metric|insight/.test(t)) return '📊';
  if (/search|filter|discover|explore/.test(t)) return '🔍';
  if (/profile|user|account|settings|preference/.test(t)) return '👤';
  if (/map|location|geo|navigation|route/.test(t)) return '🗺️';
  if (/file|upload|document|attachment/.test(t)) return '📎';
  if (/ai|recommend|personalize|predict|ml/.test(t)) return '🤖';
  if (/admin|manage|moderat|govern/.test(t)) return '🛠️';
  if (/mobile|app|responsive/.test(t)) return '📱';
  if (/review|rating|feedback/.test(t)) return '⭐';
  if (/integration|connect|api|webhook/.test(t)) return '🔗';
  if (/calendar|schedule|event|booking/.test(t)) return '📅';
  return '✨';
}

/** Shorten text for cards. */
function summarise(text: string, max = 110): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

/** Detect which widget types a screen description implies (enterprise dashboards). */
export function detectWidgets(title: string, summary: string): string[] {
  const hay = `${title} ${summary}`.toLowerCase();
  const found = new Set<string>();
  const rules: Array<[string, string[]]> = [
    ['chat', ['chat', 'assistant', 'ask', 'conversation', 'q&a']],
    ['map', ['map', 'geo', 'street', 'neighborhood', 'geospatial', 'parcel', 'aerial']],
    ['scores', ['score', 'rank', 'rating', 'quality', 'risk', 'confidence', 'strength', 'weakness']],
    ['documents', ['document', 'pdf', 'lease abstract', 'rent roll', 'appraisal', 'file', 'attachment']],
    ['table', ['table', 'grid', 'list of', 'listing', 'browse', 'search results']],
    ['charts', ['chart', 'graph', 'analytics', 'kpi', 'financial', 'revenue', 'metrics', 'trend']],
    ['filters', ['filter', 'search', 'sort', 'quick actions']],
    ['timeline', ['timeline', 'activity', 'history', 'updates']],
    ['kanban', ['kanban', 'board', 'pipeline', 'stages', 'columns']],
    ['calendar', ['calendar', 'schedule', 'booking', 'reminder']],
    ['form', ['form', 'create', 'edit', 'input', 'add new', 'onboard']],
  ];
  for (const [key, needles] of rules) {
    if (needles.some((n) => hay.includes(n))) found.add(key);
  }
  // Default widgets so no screen renders empty
  if (found.size === 0) {
    found.add('kpis');
    found.add('charts');
    found.add('table');
  }
  return [...found];
}

/** Convert a knowledge bullet into `{ id, title, summary }` triple. */
function splitBullet(bullet: string): { id: string | null; title: string; summary: string } {
  const id = firstId(bullet);
  // "`FR-001`: The system shall allow users to ..." → title="FR-001", summary="..."
  const cleaned = stripBold(bullet).trim();
  // Remove a backtick-wrapped ID, then any leading ": " the ID left behind.
  const withoutId = stripPrefixIds(cleaned).replace(/^[:：]\s*/, '');
  const colonIndex = withoutId.indexOf(': ');
  if (colonIndex > 0 && colonIndex < 80) {
    const title = withoutId.slice(0, colonIndex).trim();
    const summary = withoutId.slice(colonIndex + 2).trim();
    return { id, title: title || (id ?? 'Feature'), summary: summarise(summary) };
  }
  return {
    id,
    title: summarise(withoutId, 60),
    summary: summarise(withoutId, 110),
  };
}

/** Pull a clean idea/summary from the compiler's `**Idea:** ...` line. */
function readIdea(markdown: string): string {
  const ideaLine = parseContextBullets(markdown).find(
    (b) => b.label.toLowerCase().includes('idea'),
  );
  if (!ideaLine) return '';
  return stripBold(ideaLine.bullet).replace(/^idea\s*[:：]?\s*/i, '').trim();
}

/** Generate a stable but varied palette per project so every artifact looks distinct. */
function paletteFor(seed: string): { primary: string; accent: string } {
  const palette = [
    ['#6366f1', '#ec4899'], // indigo / pink
    ['#0ea5e9', '#22c55e'], // sky / green
    ['#f59e0b', '#ef4444'], // amber / red
    ['#14b8a6', '#8b5cf6'], // teal / violet
    ['#3b82f6', '#f97316'], // blue / orange
    ['#10b981', '#6366f1'], // emerald / indigo
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const [primary, accent] = palette[h % palette.length];
  return { primary, accent };
}

/** Build a one-line tagline when the project name doesn't already imply one. */
function buildTagline(name: string, idea: string): string {
  if (idea) {
    const first = idea.split(/[.!?]/)[0]?.trim() ?? '';
    if (first.length > 0 && first.length < 90) return first;
  }
  return `A smarter way to manage ${name.toLowerCase()}.`;
}

/**
 * Build a WebsitePlan from a project's build-prompt markdown + project name.
 * The plan is intentionally permissive: anything it can't find falls back to
 * sensible defaults so the artifact always renders.
 */
export function planFromPrompt(projectName: string, promptMarkdown: string): WebsitePlan {
  const idea = readIdea(promptMarkdown);

  const featureBullets = findBullets(promptMarkdown, ['functional requirements'], 9);
  const audienceBullets = findBullets(promptMarkdown, ['audience', 'persona'], 3);
  const techBullets = findBullets(promptMarkdown, ['recommended technologies', 'technology stack', 'llm / ai'], 6);
  const securityBullets = findBullets(promptMarkdown, ['security'], 4);

  const features: WebsiteFeature[] = featureBullets.map((b) => {
    const split = splitBullet(b);
    // Prefer a clean, human title (no raw FR-001 as the headline). The ID is
    // kept in the summary-less title path and shown as a small badge in the
    // renderer.
    const summary = split.summary || split.title;
    return {
      title: split.title,
      summary,
      icon: pickIconForTitle(`${split.title} ${summary}`),
    };
  });

  const audiences: WebsiteAudience[] = audienceBullets.map((b) => {
    // Strip leading backticked ID, leading colon, AND outer bold wrapper.
    let stripped = b
      .replace(/^`[^`]+`\s*/, '')
      .replace(/^[:：]\s*/, '')
      .trim();
    // "**Name**: blurb" → both halves wrapped; remove outer ** from the prefix only
    const colon = stripped.indexOf(': ');
    if (colon > 0 && colon < 80) {
      const rawName = stripped.slice(0, colon).trim().replace(/^\*\*|\*\*$/g, '').trim();
      const blurb = summarise(stripped.slice(colon + 2).replace(/^\*\*|\*\*$/g, '').trim(), 140);
      return { name: rawName || 'User', blurb };
    }
    stripped = stripped.replace(/^\*\*|\*\*$/g, '').trim();
    return { name: summarise(stripped, 40), blurb: summarise(stripped, 140) };
  });

  const techs: string[] = techBullets.map((b) =>
    stripBold(stripPrefixIds(b)).replace(/^[:：]?\s*/, '').replace(/^choose\s/i, '').trim(),
  );

  const securityHighlights: string[] = securityBullets.map((b) =>
    stripBold(stripPrefixIds(b)).replace(/^[:：]?\s*/, '').trim(),
  );

  // Screens → sidebar pages
  const screenBullets = findBullets(promptMarkdown, ['screens to build'], 12);
  const screens: WebsiteScreen[] = [];
  for (const b of screenBullets) {
    const split = splitBullet(b);
    screens.push({
      id: split.id ?? `SCREEN-${String(screens.length + 1).padStart(3, '0')}`,
      title: split.title,
      summary: split.summary,
      widgets: detectWidgets(split.title, split.summary),
    });
  }

  // API endpoints → API reference table (parse "VERB /path" tokens)
  const apiBullets = findBullets(promptMarkdown, ['endpoints & contracts', 'api specification'], 12);
  const endpoints: WebsiteEndpoint[] = apiBullets
    .map((b) => {
      const cleaned = stripBold(stripPrefixIds(b)).replace(/^[:：]?\s*/, '').trim();
      const m = cleaned.match(/\b(GET|POST|PUT|PATCH|DELETE|HEAD)\s+([\/\w:{}.-]+)/i);
      if (m) {
        return {
          method: m[1].toUpperCase(),
          path: m[2],
          summary: summarise(cleaned, 120),
        };
      }
      // No verb/path: still list it as an endpoint card
      return { method: '•', path: splitBullet(b).title, summary: summarise(cleaned, 120) };
    })
    .slice(0, 12);

  // Data entities → data model page
  const entityBullets = findBullets(promptMarkdown, ['entities / tables', 'data model'], 12);
  const entities: WebsiteEntity[] = entityBullets.map((b) => {
    const split = splitBullet(b);
    return { id: split.id ?? '', title: split.title, summary: split.summary };
  });

  const palette = paletteFor(projectName);

  return {
    projectName,
    tagline: buildTagline(projectName, idea),
    heroSubtitle: idea,
    description: idea || `${projectName} is the modern, opinionated platform we built to solve real workflows for teams.`,
    features:
      features.length > 0
        ? features
        : [
            {
              icon: '✨',
              title: 'Beautiful interface',
              summary: `A clean, opinionated interface for ${projectName} that gets out of your way.`,
            },
            {
              icon: '🚀',
              title: 'Fast by default',
              summary: 'Optimized data layer and edge caching keep every screen responsive.',
            },
            {
              icon: '🛡️',
              title: 'Secure & compliant',
              summary: 'Industry-standard auth, encryption, and audit logging out of the box.',
            },
          ],
    audiences:
      audiences.length > 0
        ? audiences
        : [{ name: 'Operators', blurb: 'Daily users who need quick, reliable access to core workflows.' }],
    techs:
      techs.length > 0
        ? techs
        : ['Modern web stack', 'PostgreSQL', 'Cloud-native deployment', 'Role-based access'],
    screens,
    endpoints,
    entities,
    securityHighlights:
      securityHighlights.length > 0
        ? securityHighlights
        : [
            'JWT-based authentication',
            'Role-based authorization',
            'Audit logging for sensitive actions',
            'HTTPS everywhere with strict CSP',
          ],
    primaryColor: palette.primary,
    accentColor: palette.accent,
  };
}
