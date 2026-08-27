import type { ReactNode } from "react";
import type { AgentActivityEvent, ProjectDashboard } from "@/lib/dashboard-types";
import type { KnowledgeItem } from "@workspace/api-client-react";
import {
  AGENT_DISPLAY_NAMES,
  getAgentDisplayIndex,
} from "@workspace/pipeline-config";
import {
  Brain,
  Check,
  Circle,
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  Link2,
  ArrowLeftRight,
  Clock3,
  Files,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function fileIcon(type: string) {
  const t = type.toLowerCase();
  if (t.includes("diagram") || t.includes("image") || t.includes("wireframe")) {
    return <ImageIcon className="h-4 w-4 text-info" />;
  }
  return <FileText className="h-4 w-4 text-info" />;
}

export function AgentLivePanel({
  agentKey,
  dashboard,
  activity,
  knowledge,
  liveConnected,
}: {
  agentKey: string | null;
  dashboard: ProjectDashboard | undefined;
  activity: AgentActivityEvent | undefined;
  knowledge: KnowledgeItem[] | undefined;
  liveConnected: boolean;
}) {
  const key = agentKey ?? dashboard?.currentAgentKey ?? "discovery";
  const label = AGENT_DISPLAY_NAMES[key] ?? key;
  const index = getAgentDisplayIndex(key);
  const step = dashboard?.steps.find((s) => s.agentKey === key);
  const isLive = step?.status === "RUNNING";
  const isDone = step?.status === "COMPLETED";

  const phases =
    activity?.phases ??
    (isDone
      ? [
          { phaseId: "1", label: "Analyzed project context", status: "done" as const },
          { phaseId: "2", label: "Generated structured outputs", status: "done" as const },
          { phaseId: "3", label: "Persisted knowledge items", status: "done" as const },
          { phaseId: "4", label: "Agent finished successfully", status: "done" as const },
        ]
      : isLive
        ? [
            { phaseId: "a", label: "Designing system architecture…", status: "done" as const },
            { phaseId: "b", label: "Selecting models & tools…", status: "done" as const },
            { phaseId: "c", label: "Defining data flow…", status: "done" as const },
            { phaseId: "d", label: "Creating technical diagrams…", status: "done" as const },
            { phaseId: "e", label: "Writing architecture document…", status: "active" as const },
          ]
        : [
            { phaseId: "w", label: "Waiting in queue", status: "pending" as const },
            { phaseId: "r", label: "Will run when prior stages complete", status: "pending" as const },
            { phaseId: "o", label: "Outputs will appear here", status: "pending" as const },
          ]);

  const outputs = (knowledge ?? [])
    .filter((k) => k.source === key || k.createdBy === key)
    .slice(-8);
  const exec = dashboard?.recentExecutions.find((e) => e.agentKey === key);
  const tokens = (exec?.inputTokens ?? 0) + (exec?.outputTokens ?? 0);
  const showLive = isLive && liveConnected;

  return (
    <aside className="flex w-full flex-col gap-3 xl:w-[340px] xl:shrink-0">
      {/* Header card */}
      <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground/70">
            Current Agent
          </p>
          {showLive ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              Live
            </span>
          ) : (
            <span className="text-xs font-medium text-muted-foreground/70">
              {step?.status?.replace(/_/g, " ") ?? "Idle"}
            </span>
          )}
        </div>

        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Brain className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-foreground">
              <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted/40 text-xs font-medium text-muted-foreground">
                {index || "–"}
              </span>
              {label.replace(/ Agent$/, "")}
            </p>
            <p
              className={cn(
                "mt-1 text-xs font-semibold",
                isLive && "text-primary",
                isDone && "text-success",
                !isLive && !isDone && "text-warning",
              )}
            >
              {isLive ? (
                <span className="inline-flex items-center gap-1">
                  In Progress
                  <span className="inline-flex gap-0.5">
                    <span className="h-1 w-1 animate-pulse rounded-full bg-primary" />
                    <span className="h-1 w-1 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
                    <span className="h-1 w-1 animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
                  </span>
                </span>
              ) : isDone ? (
                "Completed"
              ) : (
                "Waiting"
              )}
            </p>
          </div>
        </div>
      </div>

      {/* What it's doing */}
      <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-foreground">What it&apos;s doing</p>
        <ul className="relative space-y-0">
          <AnimatePresence initial={false}>
            {phases.map((phase, i) => {
              const isLast = i === phases.length - 1;
              return (
                <motion.li
                  key={phase.phaseId}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="relative flex gap-3 pb-3 last:pb-0"
                >
                  {!isLast && (
                    <span className="absolute left-[9px] top-5 h-[calc(100%-12px)] w-px bg-muted/50" />
                  )}
                  <span className="relative z-10 mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                    {phase.status === "done" ? (
                      <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                    ) : phase.status === "active" ? (
                      <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-primary/50 bg-card">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                      </span>
                    ) : (
                      <Circle className="h-[18px] w-[18px] text-muted-foreground/50" />
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-[13px] leading-snug",
                      phase.status === "pending" && "text-muted-foreground/70",
                      phase.status === "active" && "font-medium text-foreground",
                      phase.status === "done" && "text-muted-foreground",
                    )}
                  >
                    {phase.label}
                  </span>
                </motion.li>
              );

            })}
          </AnimatePresence>
        </ul>
      </div>
      {/* Reasoning traces / Debate — Feature 4 */}
      {activity?.reasoningTraces && activity.reasoningTraces.length > 0 && (
        <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
          <p className="mb-3 text-xs font-semibold text-muted-foreground/70">
            AI Reasoning and Debate
          </p>
          <div className="space-y-2">
            {activity.reasoningTraces.map((trace, i) => (
              <div key={i} className="rounded-xl bg-muted/30 p-3 text-xs leading-relaxed text-foreground">
                {trace}
              </div>
            ))}
          </div>
        </div>
      )}


      {/* Agent output */}
      <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground/70">
            Agent Output (Preview)
          </p>
          {outputs.length > 0 && (
            <span className="text-xs font-semibold text-primary">View all</span>
          )}
        </div>
        <div className="space-y-2">
          {outputs.length === 0 && (
            <p className="py-2 text-center text-xs text-muted-foreground/70">No outputs yet</p>
          )}
          {outputs.slice(0, 5).map((item) => {
            const filename = `${(item.externalId ?? item.type).toLowerCase().replace(/\s+/g, "_")}.md`;
            return (
              <div
                key={item.id}
                className="flex items-center gap-2.5 rounded-xl bg-muted/30 px-2.5 py-2"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card shadow-sm">
                  {fileIcon(item.type)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{filename}</p>
                  <p className="truncate text-xs text-muted-foreground/70">{item.title}</p>
                </div>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-muted-foreground/70 hover:bg-card hover:text-foreground/80"
                  title="View"
                  onClick={() =>
                    downloadText(filename, `# ${item.title}\n\n${item.description ?? ""}`)
                  }
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-muted-foreground/70 hover:bg-card hover:text-foreground/80"
                  title="Download"
                  onClick={() =>
                    downloadText(filename, `# ${item.title}\n\n${item.description ?? ""}`)
                  }
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Insights */}
      <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
        <p className="mb-3 text-xs font-semibold text-muted-foreground/70">
          AI Insights
        </p>
        <ul className="space-y-2.5 text-sm">
          <InsightRow
            icon={<Link2 className="h-3.5 w-3.5" />}
            label="Sources Analyzed"
            value={String(Math.max(outputs.length, dashboard?.knowledgeItemCount ? Math.min(23, dashboard.knowledgeItemCount) : 0) || "—")}
          />
          <InsightRow
            icon={<Files className="h-3.5 w-3.5" />}
            label="Documents Generated"
            value={String(outputs.length)}
          />
          <InsightRow
            icon={<ArrowLeftRight className="h-3.5 w-3.5" />}
            label="Tokens Used"
            value={tokens > 0 ? tokens.toLocaleString() : "—"}
          />
          <InsightRow
            icon={<Clock3 className="h-3.5 w-3.5" />}
            label="Confidence Score"
            value={`${dashboard?.aiConfidence ?? "—"}%`}
            highlight
          />
        </ul>
      </div>
    </aside>
  );
}

function InsightRow({
  icon,
  label,
  value,
  highlight,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/30 text-muted-foreground/70">
          {icon}
        </span>
        {label}
      </span>
      <span
        className={cn(
          "text-sm font-bold tabular-nums",
          highlight ? "text-success" : "text-foreground",
        )}
      >
        {value}
      </span>
    </li>
  );
}
