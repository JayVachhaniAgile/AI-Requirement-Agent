import { memo, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { isMermaidErrorSvg, prepareMermaid } from '@/lib/mermaid-utils';

declare global {
  interface Window {
    mermaid?: {
      render: (id: string, text: string) => Promise<{ svg: string }>;
      parse?: (text: string) => Promise<boolean>;
    };
  }
}

interface CodeProps {
  className?: string;
  children?: React.ReactNode;
}

/**
 * Dependency-free SVG sanitizer for mermaid output. Mermaid emits structured
 * SVGs, but the source markdown is user/LLM-controlled, so we defensively
 * strip scripts, event handlers, and javascript: URLs before mounting the
 * SVG into the DOM via innerHTML.
 */
function sanitizeSvg(svg: string): string {
  if (typeof document === 'undefined') return svg;
  const template = document.createElement('template');
  template.innerHTML = svg.trim();
  const root = template.content;
  // Remove executable/embedding nodes entirely
  root.querySelectorAll('script, iframe, object, embed, foreignObject, link').forEach((el) => el.remove());
  // Strip event-handler attributes and javascript: URLs from every element
  root.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
      } else if (
        (name === 'href' || name === 'xlink:href' || name === 'src' || name === 'xlinkhref') &&
        attr.value.trim().toLowerCase().startsWith('javascript:')
      ) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return root.querySelector('svg')?.outerHTML ?? svg;
}

function MermaidDiagram({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const render = async () => {
      const mermaid = window.mermaid;
      if (!mermaid || !containerRef.current) {
        setFailed(true);
        return;
      }
      // Mermaid v10 suppresses render errors and returns an error SVG envelope
      // instead of rejecting, so first validate + repair the source, then still
      // sniff the rendered SVG for an error placeholder before committing it.
      let repaired = prepareMermaid(code);
      try {
        if (mermaid.parse) {
          try {
            await mermaid.parse(repaired);
          } catch {
            repaired = prepareMermaid(repaired);
            await mermaid.parse(repaired);
          }
        }
        const { svg } = await mermaid.render(id, repaired);
        if (cancelled || !containerRef.current) return;
        if (isMermaidErrorSvg(svg)) {
          setFailed(true);
          return;
        }
        containerRef.current.innerHTML = sanitizeSvg(svg);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    void render();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (failed) {
    return (
      <pre className="my-4 overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 font-mono text-[13px] leading-relaxed text-foreground">
        <code>{code}</code>
      </pre>
    );
  }

  return (
    <div
      ref={containerRef}
      className="my-4 flex justify-center overflow-x-auto rounded-lg border border-border bg-muted/20 p-4"
    />
  );
}

export const MarkdownPreview = memo(function MarkdownPreview({ markdown }: { markdown: string }) {
  return (
    <div className="prose prose-slate dark:prose-invert max-w-none text-[15px] leading-[1.7]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => {
            const child = children as unknown as React.ReactElement<CodeProps>;
            const language = /language-(\w+)/.exec(child?.props?.className ?? '')?.[1];
            if (language === 'mermaid') {
              return <MermaidDiagram code={String(child.props.children ?? '')} />;
            }
            return (
              <pre className="my-4 overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 font-mono text-[13px] leading-relaxed text-foreground">
                {children}
              </pre>
            );
          },
          code: ({ className, children }) => {
            if (className) {
              return (
                <code className={cn('font-mono text-[13px] leading-relaxed', className)}>
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
});
