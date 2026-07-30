import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2,
  RefreshCw,
  FileText,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  Target,
  Users,
  Database,
  Monitor,
  Brain,
  Zap,
  Shield,
  Code2,
  BarChart3,
  MessageSquare,
  HelpCircle,
  FileSearch,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { KnowledgeItem } from "@workspace/api-client-react";

const AGENT_LABELS: Record<string, string> = {
  discovery: "Discovery Agent",
  research: "Research Agent",
  "business-analysis": "Business Analyst",
  "product-analysis": "Product Manager",
  "requirements-engineering": "Requirements Agent",
  "ux-design": "UX Agent",
  "data-architecture": "Data Architect",
  "ai-architecture": "AI Architect",
  "solution-architecture": "Solution Architect",
  "security-review": "Security Agent",
  "qa-planning": "QA Agent",
  estimation: "Estimation Agent",
  validation: "Critic Agent",
  compilation: "Compiler Agent",
  compiler: "Compiler Agent",
  debate: "Debate Agent",
};

const TYPE_ICONS: Record<string, LucideIcon> = {
  CONFIRMED_FACT: FileText,
  ASSUMPTION: HelpCircle,
  BUSINESS_GOAL: Target,
  USER_GOAL: Users,
  USER_TYPE: Users,
  RISK: AlertTriangle,
  DISCOVERY_SUMMARY: FileSearch,
  BUSINESS_OBJECTIVE: Target,
  STAKEHOLDER: Users,
  BUSINESS_REQUIREMENT: FileText,
  BUSINESS_RULE: Brain,
  BUSINESS_RISK: AlertTriangle,
  PERSONA: Users,
  MODULE: Database,
  FEATURE: Lightbulb,
  FUNCTIONAL_REQUIREMENT: Code2,
  USER_STORY: Users,
  UI_SCREEN: Monitor,
  DATA_ENTITY: Database,
  SECURITY_REQUIREMENT: Shield,
  PERFORMANCE_REQUIREMENT: Zap,
  ACCEPTANCE_CRITERIA: CheckCircle2,
  VALIDATION_ISSUE: AlertTriangle,
  ESTIMATION: BarChart3,
  RISKY_ASSUMPTION: AlertTriangle,
  DEBATE_SUMMARY: MessageSquare,
  AGENT_POSITION: Users,
  COMPILED_DOCUMENT: FileText,
};

const TYPE_COLORS: Record<string, string> = {
  CONFIRMED_FACT: "text-blue-400 bg-blue-500/10",
  ASSUMPTION: "text-amber-400 bg-amber-500/10",
  BUSINESS_GOAL: "text-emerald-400 bg-emerald-500/10",
  USER_GOAL: "text-cyan-400 bg-cyan-500/10",
  USER_TYPE: "text-purple-400 bg-purple-500/10",
  RISK: "text-red-400 bg-red-500/10",
  DISCOVERY_SUMMARY: "text-sky-400 bg-sky-500/10",
  BUSINESS_OBJECTIVE: "text-emerald-400 bg-emerald-500/10",
  STAKEHOLDER: "text-purple-400 bg-purple-500/10",
  BUSINESS_REQUIREMENT: "text-blue-400 bg-blue-500/10",
  BUSINESS_RULE: "text-indigo-400 bg-indigo-500/10",
  PERSONA: "text-purple-400 bg-purple-500/10",
  MODULE: "text-teal-400 bg-teal-500/10",
  FEATURE: "text-yellow-400 bg-yellow-500/10",
  FUNCTIONAL_REQUIREMENT: "text-green-400 bg-green-500/10",
  USER_STORY: "text-cyan-400 bg-cyan-500/10",
  UI_SCREEN: "text-pink-400 bg-pink-500/10",
  DATA_ENTITY: "text-violet-400 bg-violet-500/10",
  SECURITY_REQUIREMENT: "text-red-400 bg-red-500/10",
  PERFORMANCE_REQUIREMENT: "text-orange-400 bg-orange-500/10",
  ACCEPTANCE_CRITERIA: "text-emerald-400 bg-emerald-500/10",
  ESTIMATION: "text-amber-400 bg-amber-500/10",
  RISKY_ASSUMPTION: "text-red-400 bg-red-500/10",
  DEBATE_SUMMARY: "text-orange-400 bg-orange-500/10",
  AGENT_POSITION: "text-purple-400 bg-purple-500/10",
  COMPILED_DOCUMENT: "text-sky-400 bg-sky-500/10",
};

function formatTypeLabel(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseMetadata(meta: string | null | undefined): { reasoning?: string; evidence?: string; sourceCategory?: string; confidence?: number } {
  if (!meta) return {};
  try { return JSON.parse(meta); } catch { return {}; }
}

function formatDescription(desc: string | null | undefined): string {
  if (!desc) return "";
  return desc
    .replace(/\\n/g, "\n")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/```([\s\S]*?)```/g, "<code class='block bg-muted/50 p-2 rounded-lg text-xs my-1 overflow-x-auto'>$1</code>")
    .replace(/`([^`]+)`/g, "<code class='bg-muted/50 px-1 rounded text-xs'>$1</code>");
}

export function AgentDetailsModal({
  projectId,
  agentKey,
  open,
  onOpenChange,
}: {
  projectId: string;
  agentKey: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRegenerate = () => {
    if (!agentKey || !projectId) return;
    setRegenerating(true);
    fetch(`/api/projects/${projectId}/regenerate/${agentKey}`, { method: "POST" })
      .then(async (res) => {
        if (!res.ok) {
          let msg = `HTTP ${res.status}`;
          try { const body = await res.json(); if (body.message) msg = body.message; } catch {}
          throw new Error(msg);
        }
        // Close the modal and let the page refresh
        onOpenChange(false);
        // Brief delay then reload to pick up new workflow state
        setTimeout(() => window.location.reload(), 500);
      })
      .catch((err: Error) => {
        setError(`Regeneration failed: ${err.message}`);
      })
      .finally(() => setRegenerating(false));
  };

  useEffect(() => {
    if (!open || !agentKey || !projectId) return;

    setLoading(true);
    setError(null);

    fetch(`/api/projects/${projectId}/knowledge/by-agent/${agentKey}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load (HTTP ${res.status})`);
        return res.json() as Promise<KnowledgeItem[]>;
      })
      .then((data) => {
        setItems(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [open, agentKey, projectId]);

  const label = agentKey ? AGENT_LABELS[agentKey] ?? agentKey : "";
  const grouped = items.reduce<Record<string, KnowledgeItem[]>>((acc, item) => {
    (acc[item.type] ??= []).push(item);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <DialogTitle className="flex items-center gap-2 text-lg">
              {agentKey && (
                <span className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                  agentKey === "discovery" && "bg-blue-600 text-white",
                  agentKey === "research" && "bg-cyan-600 text-white",
                  agentKey === "business-analysis" && "bg-emerald-600 text-white",
                  agentKey === "product-analysis" && "bg-orange-600 text-white",
                  agentKey === "requirements-engineering" && "bg-teal-600 text-white",
                  agentKey === "ux-design" && "bg-purple-600 text-white",
                  agentKey === "data-architecture" && "bg-indigo-600 text-white",
                  agentKey === "ai-architecture" && "bg-cyan-500 text-white",
                  agentKey === "solution-architecture" && "bg-amber-600 text-white",
                  agentKey === "security-review" && "bg-red-600 text-white",
                  agentKey === "qa-planning" && "bg-emerald-600 text-white",
                  agentKey === "estimation" && "bg-yellow-600 text-white",
                  agentKey === "validation" && "bg-violet-600 text-white",
                  agentKey === "debate" && "bg-orange-600 text-white",
                  agentKey === "compilation" && "bg-primary text-white",
                )}
                >
                  {items.length > 0 ? items.length : "—"}
                </span>
              )}
              {label}
            </DialogTitle>
            <DialogDescription>
              {items.length > 0
                ? `${items.length} item${items.length !== 1 ? "s" : ""} generated by ${label}`
                : loading
                  ? "Loading agent outputs..."
                  : "No outputs generated yet"}
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0 mr-5">
            <Button
              onClick={handleRegenerate}
              disabled={regenerating}
              size="sm"
              variant="outline"
              className="gap-1.5 rounded-lg text-xs"
            >
              <RefreshCw className={cn("h-3.5 w-3.5 ", regenerating && "animate-spin")} />
              {regenerating ? "Regenerating..." : "Regenerate Agent"}
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-3">
          {loading && (
            <div className="flex flex-col gap-3 py-8">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center text-sm text-muted-foreground">
              <FileSearch className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="font-medium">No outputs yet</p>
              <p className="mt-1 text-xs text-muted-foreground/70">This agent hasn&apos;t generated any artifacts yet</p>
            </div>
          )}

          {!loading && !error && Object.entries(grouped).map(([type, typeItems]) => {
            const Icon = TYPE_ICONS[type] ?? FileText;
            const colorClass = TYPE_COLORS[type] ?? "text-muted-foreground bg-muted/30";

            return (
              <div key={type} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <Icon className={cn("h-4 w-4", colorClass.split(" ")[0])} />
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {formatTypeLabel(type)}
                    <span className="ml-1.5 text-muted-foreground/50">({typeItems.length})</span>
                  </h4>
                </div>
                {typeItems.map((item) => {
                  const isExpanded = expandedItems.has(item.id);
                  const hasDescription = Boolean(item.description || item.metadata);
                  return (
                    <div
                      key={item.id}
                      onClick={() => hasDescription && toggleExpanded(item.id)}
                      className={cn(
                        "group rounded-xl border bg-card/50 px-4 py-3 transition-colors",
                        hasDescription ? "cursor-pointer hover:bg-card border-border/60" : "border-border/40",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span className={cn(
                          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold",
                          colorClass,
                        )}>
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-medium text-foreground">
                              {item.externalId && (
                                <span className="mr-1.5 font-mono text-[10px] text-muted-foreground/50">
                                  {item.externalId}
                                </span>
                              )}
                              {item.title}
                            </p>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={cn(
                                "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                item.status === "CONFIRMED" && "bg-emerald-500/10 text-emerald-400",
                                item.status === "ASSUMED" && "bg-amber-500/10 text-amber-400",
                                item.status === "DRAFT" && "bg-muted/50 text-muted-foreground",
                                item.status === "VALIDATED" && "bg-green-500/10 text-green-400",
                                item.status === "REJECTED" && "bg-red-500/10 text-red-400",
                                item.status === "SUPERSEDED" && "bg-muted/50 text-muted-foreground/60",
                              )}>
                                {item.status}
                              </span>
                              {hasDescription && (
                                <svg className={cn("h-4 w-4 text-muted-foreground/50 transition-transform duration-200", isExpanded && "rotate-180")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M6 9l6 6 6-6"/>
                                </svg>
                              )}
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="mt-2 border-t border-border/40 pt-2 space-y-2">
                              {item.description ? (
                                <p
                                  className="text-xs leading-relaxed text-muted-foreground/80 whitespace-pre-line [&_strong]:font-semibold [&_strong]:text-foreground/80 [&_code]:font-mono"
                                  dangerouslySetInnerHTML={{ __html: formatDescription(item.description) }}
                                />
                              ) : null}
                              {(() => {
                                const meta = parseMetadata(item.metadata);
                                return (
                                  <>
                                    {meta.evidence && (
                                      <div>
                                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/50 mb-1">Evidence</p>
                                        <p className="text-xs leading-relaxed text-muted-foreground/70 whitespace-pre-wrap">{meta.evidence}</p>
                                      </div>
                                    )}
                                    {meta.reasoning && (
                                      <div>
                                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/50 mb-1">AI Reasoning</p>
                                        <p className="text-xs leading-relaxed text-muted-foreground/70 whitespace-pre-wrap">{meta.reasoning}</p>
                                      </div>
                                    )}
                                    {meta.confidence !== undefined && (
                                      <div className="flex items-center gap-1.5">
                                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/50">Confidence</p>
                                        <span className="text-xs font-semibold text-primary">{meta.confidence}%</span>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                              {!item.description && !parseMetadata(item.metadata).reasoning && !parseMetadata(item.metadata).evidence && (
                                <p className="text-xs text-muted-foreground/50 italic py-1">
                                  No additional content available for this item
                                </p>
                              )}
                            </div>
                          )}
                          {!isExpanded && (item.description || item.metadata) && (
                            <p className="mt-1 text-[10px] text-muted-foreground/50 truncate">
                              Click to expand {item.description ? "details" : "reasoning"}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
