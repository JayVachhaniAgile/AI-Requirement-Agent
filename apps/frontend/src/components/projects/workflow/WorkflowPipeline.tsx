import type { DashboardStep, ProjectDashboard } from "@/lib/dashboard-types";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Clock3,
  FileText,
  Lightbulb,
  AlertTriangle,
} from "lucide-react";

const AGENTS: Array<{ id: string; stage: string; label: string; agentKey: string }> = [
  { id: "discovery", stage: "DISCOVERY", label: "Discovery Agent", agentKey: "discovery" },
  { id: "research", stage: "RESEARCH", label: "Research Agent", agentKey: "research" },
  { id: "ba", stage: "BUSINESS_ANALYSIS", label: "Business Analyst", agentKey: "business-analysis" },
  { id: "pm", stage: "PRODUCT_ANALYSIS", label: "Product Manager", agentKey: "product-analysis" },
  { id: "req", stage: "REQUIREMENTS_ENGINEERING", label: "Requirements Agent", agentKey: "requirements-engineering" },
  { id: "ux", stage: "UX_DESIGN", label: "UX Agent", agentKey: "ux-design" },
  { id: "data", stage: "DATA_ARCHITECTURE", label: "Data Architect", agentKey: "data-architecture" },
  { id: "ai", stage: "AI_ARCHITECTURE", label: "AI Architect", agentKey: "ai-architecture" },
  { id: "solution", stage: "SOLUTION_ARCHITECTURE", label: "Solution Architect", agentKey: "solution-architecture" },
  { id: "security", stage: "SECURITY_REVIEW", label: "Security Agent", agentKey: "security-review" },
  { id: "qa", stage: "QA_PLANNING", label: "QA Agent", agentKey: "qa-planning" },
  { id: "estimation", stage: "ESTIMATION", label: "Estimation Agent", agentKey: "estimation" },
  { id: "critic", stage: "VALIDATION", label: "Critic Agent", agentKey: "validation" },
  { id: "compiler", stage: "COMPILATION", label: "Compiler Agent", agentKey: "compilation" },
];

const COLS = 4;

type FlowState = "done" | "active" | "pending";

function formatDuration(step: DashboardStep | undefined, status: string): string {
  if (status === "COMPLETED" && step?.durationMs != null) {
    const m = step.durationMs / 60000;
    return m < 1
      ? `Took ${Math.max(1, Math.round(step.durationMs / 1000))}s`
      : `Took ${m.toFixed(1)}m`;
  }
  if (status === "RUNNING") {
    const eta = step?.estimatedSeconds ?? 120;
    return `ETA: ${Math.max(1, Math.round(eta / 60))} min`;
  }
  if (status === "FAILED") return "Failed";
  const takes = step?.estimatedSeconds ?? 90;
  return `Takes ~ ${Math.max(1, Math.round(takes / 60))}m`;
}

function edgeState(fromStatus: string, toStatus: string): FlowState {
  if (toStatus === "RUNNING" || fromStatus === "RUNNING") return "active";
  if (fromStatus === "COMPLETED") return "done";
  return "pending";
}

function AgentCard({
  index,
  label,
  status,
  durationLabel,
  progress,
  selected,
  onSelect,
}: {
  index: number;
  label: string;
  status: string;
  durationLabel: string;
  progress?: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const isRunning = status === "RUNNING";
  const isDone = status === "COMPLETED";
  const isFailed = status === "FAILED";
  const isWaiting = !isRunning && !isDone && !isFailed;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative z-10 flex h-full w-full flex-col rounded-2xl border bg-card px-3.5 py-3 text-left shadow-sm transition-all hover:shadow-md",
        isDone && "border-success/30",
        isRunning && "border-primary/50 shadow-[0_0_0_3px_hsl(var(--primary)/0.15)]",
        isWaiting && "border-warning/30",
        isFailed && "border-destructive/30",
        selected && "ring-2 ring-primary/30",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-primary-foreground",
            isDone && "bg-success/100",
            isRunning && "bg-primary",
            isWaiting && "bg-warning/60",
            isFailed && "bg-destructive/100",
          )}
        >
          {index}
        </span>
        <div className="min-w-0 flex-1 pr-6">
          <p className="truncate text-sm font-semibold text-foreground">{label}</p>
          <p
            className={cn(
              "mt-1 text-xs font-semibold",
              isDone && "text-success",
              isRunning && "text-primary",
              isWaiting && "text-warning",
              isFailed && "text-destructive",
            )}
          >
            {isDone && "Completed"}
            {isRunning && (
              <span className="inline-flex items-center gap-1">
                In Progress
                <span className="inline-flex gap-0.5">
                  <span className="h-1 w-1 animate-pulse rounded-full bg-primary" />
                  <span className="h-1 w-1 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
                  <span className="h-1 w-1 animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
                </span>
              </span>
            )}
            {isWaiting && "Waiting"}
            {isFailed && "Failed"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">{durationLabel}</p>
          {isRunning && (
            <div className="mt-2.5">
              <div className="mb-1 flex justify-between text-xs font-semibold text-primary">
                <span>Progress</span>
                <span>{progress ?? 0}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-primary/20">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, progress ?? 35)}%` }}
                />
              </div>
            </div>
          )}
        </div>
        <span className="absolute right-3 top-3">
          {isDone && <CheckCircle2 className="h-5 w-5 text-success" />}
          {isWaiting && <Clock3 className="h-5 w-5 text-warning/70" />}
          {isFailed && <AlertTriangle className="h-5 w-5 text-destructive" />}
        </span>
      </div>
    </button>
  );
}

/** Animated dashed flow line (horizontal or vertical). */
function FlowLine({
  direction,
  state,
  className,
}: {
  direction: "horizontal" | "vertical";
  state: FlowState;
  className?: string;
}) {
  const isH = direction === "horizontal";
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center",
        isH ? "h-auto w-7 self-center" : "h-8 w-full",
        className,
      )}
      aria-hidden
    >
      <svg
        className={cn(isH ? "h-3 w-full" : "h-full w-3")}
        viewBox={isH ? "0 0 28 12" : "0 0 12 32"}
        fill="none"
        preserveAspectRatio="none"
      >
        <line
          x1={isH ? 0 : 6}
          y1={isH ? 6 : 0}
          x2={isH ? 20 : 6}
          y2={isH ? 6 : 24}
          className={cn(
            "pipeline-flow-stroke",
            state === "active" && "pipeline-flow-active",
            state === "done" && "pipeline-flow-done",
            state === "pending" && "pipeline-flow-pending",
          )}
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Arrow head */}
        {isH ? (
          <path
            d="M18 2 L26 6 L18 10"
            className={cn(
              "pipeline-flow-head",
              state === "active" && "pipeline-flow-active",
              state === "done" && "pipeline-flow-done",
              state === "pending" && "pipeline-flow-pending",
            )}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ) : (
          <path
            d="M2 22 L6 30 L10 22"
            className={cn(
              "pipeline-flow-head",
              state === "active" && "pipeline-flow-active",
              state === "done" && "pipeline-flow-done",
              state === "pending" && "pipeline-flow-pending",
            )}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        )}
      </svg>
    </div>
  );
}

/**
 * Wrap connector from end of row (card 4/8/12) down to start of next row (5/9/13).
 * Drawn as: down from right column, then left across, then down into next row.
 */
function RowWrapConnector({ state, fromIndex, toIndex }: { state: FlowState; fromIndex: number; toIndex: number }) {
  return (
    <div className="relative hidden h-14 w-full lg:block" aria-hidden>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1000 56" fill="none" preserveAspectRatio="none">
        {/* Start under last card of row (~87.5% = center of 4th column) → down → left to first col (~12.5%) → down */}
        <path
          d="M 875 0 L 875 22 L 125 22 L 125 48"
          className={cn(
            "pipeline-flow-stroke",
            state === "active" && "pipeline-flow-active",
            state === "done" && "pipeline-flow-done",
            state === "pending" && "pipeline-flow-pending",
          )}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M 119 40 L 125 50 L 131 40"
          className={cn(
            "pipeline-flow-head",
            state === "active" && "pipeline-flow-active",
            state === "done" && "pipeline-flow-done",
            state === "pending" && "pipeline-flow-pending",
          )}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        className={cn(
          "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border bg-card px-2 py-0.5 text-xs font-semibold tabular-nums shadow-sm",
          state === "active" && "border-primary/20 text-primary",
          state === "done" && "border-success/20 text-success",
          state === "pending" && "border-border text-muted-foreground/70",
        )}
      >
        {fromIndex} → {toIndex}
      </span>
    </div>
  );
}

export function WorkflowPipeline({
  dashboard,
  selectedAgentKey,
  onSelectAgent,
}: {
  dashboard: ProjectDashboard | undefined;
  selectedAgentKey: string | null;
  onSelectAgent: (agentKey: string | null, stage?: string) => void;
}) {
  const byStage = new Map((dashboard?.steps ?? []).map((s) => [s.stage, s]));
  const projectDone = dashboard?.status === "COMPLETED";
  const finalReady = projectDone || Boolean(dashboard?.hasDocument);

  const statuses = AGENTS.map((a) => byStage.get(a.stage)?.status ?? "QUEUED");
  const firstStatus = statuses[0] ?? "QUEUED";
  const lastStatus = statuses[statuses.length - 1] ?? "QUEUED";

  const rows: Array<typeof AGENTS> = [];
  for (let i = 0; i < AGENTS.length; i += COLS) {
    rows.push(AGENTS.slice(i, i + COLS));
  }

  const inputToFirst: FlowState =
    firstStatus === "RUNNING" || firstStatus === "COMPLETED" || projectDone
      ? firstStatus === "RUNNING"
        ? "active"
        : "done"
      : statuses.some((s) => s === "RUNNING")
        ? "done"
        : "pending";

  const lastToFinal: FlowState = finalReady
    ? "done"
    : lastStatus === "COMPLETED" || lastStatus === "RUNNING"
      ? lastStatus === "RUNNING"
        ? "active"
        : "active"
      : "pending";

  return (
    <div className="w-full space-y-1">
      {/* Input */}
      <button
        type="button"
        onClick={() => onSelectAgent(null)}
        className="w-full rounded-2xl border border-primary/10 bg-card px-5 py-4 text-left shadow-sm"
      >
        <div className="mb-2 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lightbulb className="h-4 w-4" />
          </span>
          <p className="text-sm font-semibold text-foreground">User Idea / Input</p>
        </div>
        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {dashboard?.idea ?? "No idea text yet"}
        </p>
      </button>

      <FlowLine direction="vertical" state={inputToFirst} />

      {rows.map((row, rowIndex) => {
        const startIndex = rowIndex * COLS;
        const isLastRow = rowIndex === rows.length - 1;
        const lastInRowGlobalIndex = startIndex + row.length - 1;
        const nextFirstGlobalIndex = lastInRowGlobalIndex + 1;

        return (
          <div key={`row-${rowIndex}`} className="space-y-1">
            {/* Sequential row: card → card → card → card */}
            <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch lg:gap-0">
              {row.map((agent, col) => {
                const index = startIndex + col + 1;
                const step = byStage.get(agent.stage);
                const status = step?.status ?? "QUEUED";
                const running = status === "RUNNING";
                const nextInRow = row[col + 1];
                const nextStatus = nextInRow
                  ? (byStage.get(nextInRow.stage)?.status ?? "QUEUED")
                  : "QUEUED";

                return (
                  <div key={agent.id} className="flex min-w-0 flex-1 items-stretch">
                    <div className="min-w-0 flex-1">
                      <AgentCard
                        index={index}
                        label={agent.label}
                        status={status}
                        durationLabel={formatDuration(step, status)}
                        progress={
                          running && dashboard?.currentStage === agent.stage
                            ? dashboard.currentStepProgress
                            : running
                              ? 45
                              : undefined
                        }
                        selected={selectedAgentKey === agent.agentKey}
                        onSelect={() => onSelectAgent(agent.agentKey, agent.stage)}
                      />
                    </div>
                    {nextInRow && (
                      <FlowLine
                        direction="horizontal"
                        state={edgeState(status, nextStatus)}
                        className="hidden lg:flex"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Wrap to next row: N → N+1 */}
            {!isLastRow && (
              <RowWrapConnector
                fromIndex={lastInRowGlobalIndex + 1}
                toIndex={nextFirstGlobalIndex + 1}
                state={edgeState(
                  statuses[lastInRowGlobalIndex] ?? "QUEUED",
                  statuses[nextFirstGlobalIndex] ?? "QUEUED",
                )}
              />
            )}
          </div>
        );
      })}

      <FlowLine direction="vertical" state={lastToFinal} />

      {/* Final document */}
      <button
        type="button"
        onClick={() => onSelectAgent("compilation", "COMPILATION")}
        className={cn(
          "flex w-full items-center gap-4 rounded-2xl border bg-card px-5 py-4 text-left shadow-sm",
          finalReady ? "border-success/20" : "border-primary/20",
        )}
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <FileText className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Requirement Document</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {finalReady
              ? "Final output is ready for export."
              : "Final output will be ready for export."}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold",
            finalReady ? "bg-success/10 text-success/90" : "bg-warning/10 text-warning",
          )}
        >
          {finalReady ? "Ready" : "Pending"}
        </span>
      </button>
    </div>
  );
}
