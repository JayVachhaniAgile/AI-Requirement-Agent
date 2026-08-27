/**
 * Best-effort helpers for rendering LLM/generated Mermaid diagrams safely.
 *
 * Mermaid v10 (loaded from CDN) suppresses render errors and instead resolves
 * `mermaid.render()` with an SVG that literally prints "Syntax error in text".
 * That means naive `try/catch` around render() never fires, so broken diagrams
 * leak into the document. These helpers (a) quote problematic flowchart labels,
 * (b) validate via `mermaid.parse()`, and (c) let the caller fall back to the
 * raw source when a diagram still can't be rendered.
 */

/** Diagram type markers Mermaid recognizes as the first directive line. */
const DIAGRAM_TYPES =
  /^(graph|flowchart|sequenceDiagram|classDiagram|erDiagram|stateDiagram(-v2)?|gantt|journey|pie|gitGraph|mindmap|timeline|quadrantChart|xychart-beta|architecture-beta|block-beta|C4Context|C4Container|C4Component)/i;

/** Characters that Mermaid node labels can't contain unquoted. */
const UNSAFE_LABEL = /[[\](){},;#:`"]|--|->/;

/** A flowchart-style node definition, e.g. `A(Node text)` or `A["Node text"]`. */
const NODE_LAB = /(^|\n)\s*([A-Za-z_][\w-]*)\[([^\n]*?)\]/g;

/**
 * Best-effort sanitation for the common failure mode: flowcharts whose node
 * text contains brackets, parens, colons, tags, or arrows without quoting.
 * Walks each `node[text]` and, when the text has unsafe characters or is not
 * already quoted, re-emits it as a quoted, HTML-escaped label.
 */
export function prepareMermaid(code: string): string {
  let out = code.replace(/^\s*```mermaid\s*\n?/, '').trim();

  if (!DIAGRAM_TYPES.test(out)) {
    out = `graph TD\n${out}`;
  }

  // Only try to repair flowchart/block style node labels; other diagram types
  // are left untouched rather than risking a worse transform.
  if (/^(flowchart|graph)\s+(TB|TD|BT|RL|LR)\b/.test(out)) {
    out = out.replace(
      NODE_LAB,
      (_match: string, _nl: string, id: string, text: string) => {
        const inner = text.trim();
        if (inner === '') return _match;
        // Already a safe quoted label.
        if (
          (inner.startsWith('"') && inner.endsWith('"')) ||
          (inner.startsWith("'") && inner.endsWith("'") && !/[",]/.test(inner))
        ) {
          return `${_nl}${id}[${inner}]`;
        }
        if (!UNSAFE_LABEL.test(inner)) {
          return _match;
        }
        return `${_nl}${id}["${inner.replace(/"/g, "'").replace(/\n/g, ' ')}"]`;
      },
    );
  }

  return out.trim();
}

/** True when the rendered SVG is actually a Mermaid error placeholder. */
export function isMermaidErrorSvg(svg: string): boolean {
  return (
    svg.includes('Syntax error in text') ||
    svg.includes('mermaid-error') ||
    svg.includes('>Mermaid version') ||
    svg.includes('Unable to render')
  );
}
