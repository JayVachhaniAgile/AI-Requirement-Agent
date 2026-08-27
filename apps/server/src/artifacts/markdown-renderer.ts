/**
 * Dependency-free, XSS-safe markdown -> HTML renderer used to produce
 * standalone artifact pages from generated prompt documents.
 *
 * Supports a pragmatic GFM subset: ATX headings, paragraphs, bold/italic,
 * inline code, fenced code blocks, unordered/ordered lists (with one level of
 * nesting), GFM pipe tables, blockquotes, horizontal rules, links, images and
 * strikethrough. All raw HTML is escaped so LLM/user content cannot inject
 * markup or script into the artifact page.
 */

export interface RenderMarkdownOptions {
  /** Render links as target=_blank with rel=noopener (default true). */
  externalLinksNewTab?: boolean;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Inline formatting: code, bold, italic, strikethrough, links, images. */
function renderInline(text: string, options: RenderMarkdownOptions): string {
  const newTab = options.externalLinksNewTab ?? true;

  // Escape first — everything the LLM produced is untrusted.
  let out = escapeHtml(text);

  // Inline code (must run before bold/italic so `**` inside code is preserved)
  out = out.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // Images: ![alt](url)
  out = out.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
    (_m, alt: string, src: string) => {
      const safeSrc = sanitizeUrl(src);
      if (!safeSrc) return '';
      return `<img src="${escapeHtml(safeSrc)}" alt="${escapeHtml(alt)}" loading="lazy" />`;
    },
  );

  // Links: [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, label: string, url: string) => {
    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) return escapeHtml(label);
    const target = newTab ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${escapeHtml(safeUrl)}"${target}>${label}</a>`;
  });

  // Bold
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  // Strikethrough
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  return out;
}

/** Block URL protocols that could execute code or leak data in the artifact page. */
function sanitizeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (/^(javascript|vbscript|data|file):/.test(lower)) return null;
  return trimmed;
}

interface TableRow {
  cells: string[];
}

function parseTable(lines: string[], start: number): { html: string; next: number } {
  const headerCells = splitTableRow(lines[start]);
  // Skip delimiter row (|---|)
  let i = start + 1;
  const bodyRows: TableRow[] = [];
  while (i < lines.length && lines[i].trim().startsWith('|')) {
    const row = splitTableRow(lines[i]);
    if (row.every((c) => /^:?-{1,}:?$/.test(c.trim()))) {
      i++;
      continue;
    }
    bodyRows.push({ cells: row });
    i++;
  }
  const renderRow = (cells: string[], tag: 'th' | 'td') =>
    `<tr>${cells.map((c) => `<${tag}>${renderInline(c.trim(), { externalLinksNewTab: false })}</${tag}>`).join('')}</tr>`;
  const thead = `<thead>${renderRow(headerCells, 'th')}</thead>`;
  const tbody = bodyRows.length
    ? `<tbody>${bodyRows.map((r) => renderRow(r.cells, 'td')).join('')}</tbody>`
    : '';
  return { html: `<table>${thead}${tbody}</table>`, next: i };
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/** A single list item with its indentation level (spaces) and content. */
interface CollectedListItem {
  indent: number;
  content: string;
  ordered: boolean;
}

/** Collect consecutive `-`/`*`/`+` or `1.` items starting at `start`. */
function collectListItems(
  lines: string[],
  start: number,
  ordered: boolean,
): { items: CollectedListItem[]; next: number } {
  const items: CollectedListItem[] = [];
  let i = start;
  const pattern = ordered ? /^(\s*)\d+\.\s+(.*)$/ : /^(\s*)[-*+]\s+(.*)$/;
  while (i < lines.length) {
    const match = pattern.exec(lines[i]);
    if (!match) break;
    items.push({
      indent: match[1].length,
      content: match[2].trim(),
      ordered,
    });
    i++;
  }
  return { items, next: i };
}

/** Recursively build <ul>/<ol> from collected items (handles arbitrary nesting). */
function buildListHtml(
  items: CollectedListItem[],
  start: number,
): { html: string; next: number } {
  const level = items[start].indent;
  const tag = items[start].ordered ? 'ol' : 'ul';
  let html = `<${tag}>`;
  let i = start;
  while (i < items.length && items[i].indent === level) {
    let itemHtml = `<li>${renderInline(items[i].content, { externalLinksNewTab: false })}`;
    if (i + 1 < items.length && items[i + 1].indent > level) {
      const nested = buildListHtml(items, i + 1);
      itemHtml += nested.html;
      i = nested.next;
    } else {
      i++;
    }
    itemHtml += '</li>';
    html += itemHtml;
  }
  html += `</${tag}>`;
  return { html, next: i };
}

/** Turn a `- item` / `1. item` block into <ul>/<ol>. */
function renderList(lines: string[], start: number, ordered: boolean): { html: string; next: number } {
  const { items, next } = collectListItems(lines, start, ordered);
  if (items.length === 0) return { html: '', next: start };
  const { html } = buildListHtml(items, 0);
  return { html, next };
}

/**
 * Convert markdown to an HTML fragment. The result is safe to embed in a
 * full HTML document because every source character is escaped before any
 * formatting is applied.
 */
export function renderMarkdown(markdown: string, options: RenderMarkdownOptions = {}): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank line -> paragraph separator
    if (!trimmed) {
      i++;
      continue;
    }

    // ATX heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2].trim(), options)}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      out.push('<hr />');
      i++;
      continue;
    }

    // Fenced code block
    if (/^```/.test(trimmed)) {
      const fence = trimmed.match(/^```(\S*)\s*$/);
      const lang = fence?.[1] ?? '';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      const code = escapeHtml(codeLines.join('\n'));
      out.push(`<pre${lang ? ` class="language-${escapeHtml(lang)}"` : ''}><code>${code}</code></pre>`);
      continue;
    }

    // Table
    if (trimmed.startsWith('|') && i + 1 < lines.length && /^\|[\s:|-]+\|?$/.test(lines[i + 1].trim())) {
      const table = parseTable(lines, i);
      out.push(table.html);
      i = table.next;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${renderMarkdown(quoteLines.join('\n'), options)}</blockquote>`);
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const list = renderList(lines, i, false);
      out.push(list.html);
      i = list.next;
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const list = renderList(lines, i, true);
      out.push(list.html);
      i = list.next;
      continue;
    }

    // Paragraph: collect until blank line or a block-level token
    const paraLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6})\s/.test(lines[i].trim()) &&
      !/^```/.test(lines[i].trim()) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !lines[i].trim().startsWith('|') &&
      !lines[i].trim().startsWith('>') &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    out.push(`<p>${renderInline(paraLines.join(' '), options)}</p>`);
  }

  return out.join('\n');
}
