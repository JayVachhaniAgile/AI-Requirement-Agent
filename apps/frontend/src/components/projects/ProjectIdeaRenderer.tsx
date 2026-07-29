import { useMemo } from "react";

/**
 * Smart renderer for the project idea field.
 * Detects JSON objects, file-uploaded content (--- headers), and plain text,
 * then renders each in a visually appealing way.
 */

interface ParsedSection {
  title?: string;
  content: string;
  type: "json-value" | "file" | "text";
}

function parseIdea(raw: string): ParsedSection[] {
  const trimmed = raw.trim();

  // Try JSON parse
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed);
      return flattenJsonObject(obj);
    } catch {
      // not valid JSON — fall through
    }
  }

  // Check for file upload headers: "--- filename ---"
  if (/^--- .+ ---\s*$/m.test(trimmed)) {
    return parseFileSections(trimmed);
  }

  // Plain text — split on double newlines into paragraphs
  return [{ content: trimmed, type: "text" }];
}

function flattenJsonObject(obj: Record<string, unknown>, depth = 0): ParsedSection[] {
  const sections: ParsedSection[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;

    if (typeof value === "string") {
      sections.push({
        title: formatKey(key),
        content: value,
        type: "json-value",
      });
    } else if (Array.isArray(value)) {
      const items = value.map((v) => {
        if (typeof v === "string") return v;
        if (typeof v === "object" && v !== null) return JSON.stringify(v);
        return String(v);
      });
      sections.push({
        title: formatKey(key),
        content: items.join("\n"),
        type: "json-value",
      });
    } else if (typeof value === "object") {
      // Nested object — recurse
      sections.push(...flattenJsonObject(value as Record<string, unknown>, depth + 1));
    } else {
      sections.push({
        title: formatKey(key),
        content: String(value),
        type: "json-value",
      });
    }
  }
  return sections;
}

function formatKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function parseFileSections(raw: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const parts = raw.split(/(?=^--- .+ ---\s*$)/m).filter(Boolean);

  for (const part of parts) {
    const headerMatch = part.match(/^--- (.+?) ---\s*/);
    if (headerMatch) {
      const title = headerMatch[1];
      const content = part.slice(headerMatch[0].length).trim();
      sections.push({ title, content, type: "file" });
    } else {
      const content = part.trim();
      if (content) sections.push({ content, type: "text" });
    }
  }

  return sections.length > 0 ? sections : [{ content: raw, type: "text" }];
}

function SectionCard({ section }: { section: ParsedSection }) {
  if (section.type === "json-value" && section.title) {
    // Key-value card for JSON fields
    const items = section.content.split("\n").filter(Boolean);
    const isList = items.length > 1;

    return (
      <div className="rounded-xl border border-border/50 bg-card/60 overflow-hidden">
        <div className="px-4 py-2 bg-muted/30 border-b border-border/50">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {section.title}
          </h4>
        </div>
        <div className="px-4 py-3">
          {isList ? (
            <ul className="space-y-1.5">
              {items.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/40 shrink-0" />
                  <span className="text-foreground/90">{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">{section.content}</p>
          )}
        </div>
      </div>
    );
  }

  if (section.type === "file" && section.title) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/60 overflow-hidden">
        <div className="px-4 py-2 bg-muted/30 border-b border-border/50 flex items-center gap-2">
          <span className="text-xs">📄</span>
          <h4 className="text-xs font-semibold text-muted-foreground">{section.title}</h4>
        </div>
        <div className="px-4 py-3">
          <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap font-mono">
            {section.content}
          </p>
        </div>
      </div>
    );
  }

  // Plain text
  return (
    <div className="px-1">
      <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
        {section.content}
      </p>
    </div>
  );
}

export function ProjectIdeaRenderer({ idea }: { idea: string }) {
  const sections = useMemo(() => parseIdea(idea), [idea]);

  return (
    <div className="space-y-3">
      {sections.map((section, i) => (
        <SectionCard key={i} section={section} />
      ))}
    </div>
  );
}
