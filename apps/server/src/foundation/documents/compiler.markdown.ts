/**
 * Reusable markdown primitives (Phase 9) — shared by every compiled document.
 */
export function h1(text: string): string {
  return `# ${text}`;
}

export function h2(text: string): string {
  return `## ${text}`;
}

export function h3(text: string): string {
  return `### ${text}`;
}

export function paragraph(text: string): string {
  return text.trim();
}

export function bulletList(items: Array<string | undefined>): string {
  const filtered = items.filter((i): i is string => !!i && i.trim().length > 0);
  if (filtered.length === 0) return '';
  return filtered.map((i) => `- ${i.trim()}`).join('\n');
}

export function table(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  if (rows.length === 0) return '';
  const esc = (v: string | number | null | undefined): string =>
    String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
  const headerLine = `| ${headers.map(esc).join(' | ')} |`;
  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.map(esc).join(' | ')} |`);
  return [headerLine, separator, ...body].join('\n');
}

export function kvBlock(entries: Array<[string, string | number | undefined]>): string {
  const filtered = entries.filter(([, v]) => v !== undefined && String(v).length > 0);
  if (filtered.length === 0) return '';
  return filtered.map(([k, v]) => `- **${k}:** ${v}`).join('\n');
}

export function codeBlock(lang: string, content: string): string {
  return '```' + lang + '\n' + content + '\n```';
}

/** Deterministic order: kind then externalId (stable across runs). */
export function sortArtifacts<T extends { kind: string; externalId: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.externalId.localeCompare(b.externalId);
  });
}

export function jsonToYaml(value: unknown, indent = 0): string {
  const pad = ' '.repeat(indent);
  if (value === null || value === undefined) return pad + 'null';
  if (typeof value === 'string') return pad + JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return pad + String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return pad + '[]';
    return value.map((v) => `${pad}- ${jsonToYaml(v, indent + 2).trimStart()}`).join('\n');
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return pad + '{}';
    return entries
      .map(([k, v]) => {
        if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          return `${pad}${k}:\n${jsonToYaml(v, indent + 2)}`;
        }
        return `${pad}${k}: ${jsonToYaml(v, 0).trimStart()}`;
      })
      .join('\n');
  }
  return pad + String(value);
}
