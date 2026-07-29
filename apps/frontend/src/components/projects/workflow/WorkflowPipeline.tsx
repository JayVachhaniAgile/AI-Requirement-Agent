import type { DashboardStep, ProjectDashboard } from "@/lib/dashboard-types";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Clock3,
  RefreshCw,
  AlertTriangle,
  Lightbulb,
  FileText,
} from "lucide-react";


const AGENT_ICONS: Record<string, string> = {
  discovery: "/agentBackgrounds/Discovery.png",
  research: "/agentBackgrounds/Research.png",
  "business-analysis": "/agentBackgrounds/BusinessAnalyst.png",
  "product-analysis": "/agentBackgrounds/ProductManager.png",
  "requirements-engineering": "/agentBackgrounds/RequirementAgent.png",
  "ux-design": "/agentBackgrounds/UXAgent.png",
  "data-architecture": "/agentBackgrounds/DataArchitect.png",
  "ai-architecture": "/agentBackgrounds/AIArchitect.png",
  "solution-architecture": "/agentBackgrounds/SolutionArchitect.png",
  "security-review": "/agentBackgrounds/SecurityAgent.png",
  "qa-planning": "/agentBackgrounds/QAAgent.png",
  estimation: "/agentBackgrounds/EstimationAgent.png",
  validation: "/agentBackgrounds/ValidationAgent.png",
  compilation: "/agentBackgrounds/CompilationAgent.png",
  debate: "/agentBackgrounds/ValidationAgent.png",
};

const AGENT_GRADIENTS: Record<string, string> = {
  discovery: "bg-gradient-to-br from-blue-600 to-purple-700",
  research: "bg-gradient-to-br from-cyan-500 to-blue-600",
  "business-analysis": "bg-gradient-to-br from-green-500 to-emerald-600",
  "product-analysis": "bg-gradient-to-br from-orange-500 to-amber-600",
  "requirements-engineering": "bg-gradient-to-br from-teal-500 to-cyan-600",
  "ux-design": "bg-gradient-to-br from-purple-500 to-pink-600",
  "data-architecture": "bg-gradient-to-br from-indigo-500 to-purple-600",
  "ai-architecture": "bg-gradient-to-br from-cyan-400 to-teal-600",
  "solution-architecture": "bg-gradient-to-br from-amber-500 to-yellow-600",
  "security-review": "bg-gradient-to-br from-red-500 to-rose-600",
  "qa-planning": "bg-gradient-to-br from-emerald-500 to-green-600",
  estimation: "bg-gradient-to-br from-yellow-400 to-orange-500",
  validation: "bg-gradient-to-br from-violet-500 to-purple-700",
  compilation: "bg-gradient-to-br from-primary to-primary/80",
  debate: "bg-gradient-to-br from-orange-500 to-red-600",
};

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
  { id: "debate", stage: "DEBATE", label: "Debate Agent", agentKey: "debate" },
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

const RUNNING_ANIMATIONS = `
  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(200%); }
  }
  @keyframes borderPulse {
    0%, 100% { border-color: rgba(59, 130, 246, 0.3); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.1); }
    50% { border-color: rgba(59, 130, 246, 0.8); box-shadow: 0 0 20px 4px rgba(59, 130, 246, 0.2); }
  }
  @keyframes glowPulse {
    0%, 100% { opacity: 0.4; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.15); }
  }
  @keyframes spinBorder {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  @keyframes breathe {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.06); }
  }
  @keyframes floatUp {
    0% { transform: translateY(0) scale(1); opacity: 0.6; }
    50% { opacity: 0.3; }
    100% { transform: translateY(-40px) scale(0.5); opacity: 0; }
  }
  @keyframes scanLine {
    0% { top: -2px; }
    100% { top: calc(100% - 2px); }
  }
  @keyframes gradientShift {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  @keyframes pulseDot {
    0%, 100% { opacity: 0.2; transform: scale(0.8); }
    50% { opacity: 1; transform: scale(1.3); }
  }
`;

function AgentCard({
  index,
  label,
  status,
  durationLabel,
  progress,
  selected,
  onSelect,
  onResume,
  imageSrc,
  gradientClass,
}: {
  index: number;
  label: string;
  status: string;
  durationLabel: string;
  progress?: number;
  selected: boolean;
  onSelect: () => void;
  onResume?: () => void;
  imageSrc: string;
  gradientClass: string;
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
        "relative z-10 flex h-full min-h-[140px] w-full flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-all hover:shadow-md",

        isRunning && "border-primary/50 shadow-[0_0_0_3px_hsl(var(--primary)/0.3)] animate-[borderPulse_2s_ease-in-out_infinite,breathe_3s_ease-in-out_infinite]",
        isWaiting && "border-warning/30",
        isFailed && "border-destructive/30",
        selected && "ring-2 ring-primary/30",
      )}
    >
      <img
        src={imageSrc}
        alt={label}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className={`absolute inset-0 ${gradientClass} ${isRunning ? "opacity-90 animate-[gradientShift_4s_ease_infinite] bg-[length:200%_200%]" : "opacity-80"}`} />
      {isRunning && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute inset-y-0 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/15 to-transparent animate-[shimmer_2s_infinite]" />
          {/* Floating particles */}
          <div className="absolute bottom-0 left-1/4 w-1 h-1 rounded-full bg-primary/60 animate-[floatUp_2.5s_ease-out_infinite]" />
          <div className="absolute bottom-0 left-2/4 w-1.5 h-1.5 rounded-full bg-primary/40 animate-[floatUp_3s_ease-out_infinite_0.5s]" />
          <div className="absolute bottom-0 left-3/4 w-1 h-1 rounded-full bg-blue-300/50 animate-[floatUp_2s_ease-out_infinite_1s]" />
          <div className="absolute bottom-0 left-1/3 w-1 h-1 rounded-full bg-cyan-400/60 animate-[floatUp_3.5s_ease-out_infinite_0.3s]" />
          <div className="absolute bottom-0 left-2/3 w-1.5 h-1.5 rounded-full bg-primary/30 animate-[floatUp_2.8s_ease-out_infinite_0.8s]" />
          {/* Scan line */}
          <div className="absolute left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-primary/40 to-transparent animate-[scanLine_2.5s_ease-in-out_infinite]" />
          {/* Corner decorations */}
          <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-primary/40 rounded-tl-2xl" />
          <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-primary/40 rounded-tr-2xl" />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-primary/40 rounded-bl-2xl" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-primary/40 rounded-br-2xl" />
        </div>
      )}
      <div className="relative z-10 flex h-full flex-col items-center justify-center p-3.5 text-center">
        <span
          className={cn(
            "mb-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/90 text-xs font-bold text-gray-800",
            isRunning && "bg-primary shadow-[0_0_14px_6px_rgba(59,130,246,0.5)] animate-[glowPulse_1.5s_ease-in-out_infinite]",
            isWaiting && "bg-warning/60",
            isFailed && "bg-destructive/100",
          )}
        >
          {index}
        </span>
        <p className="mb-1 truncate text-center text-sm font-semibold text-white">{label}</p>
        <p
          className={cn(
            "text-xs font-semibold",
            isRunning && "text-primary",
            isWaiting && "text-warning",
            isFailed && "text-destructive",
          )}
        >
          {isRunning && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
              In Progress
              <span className="inline-flex gap-0.5">
                <span className="h-1 w-1 animate-pulse rounded-full bg-primary" />
                <span className="h-1 w-1 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
                <span className="h-1 w-1 animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
              </span>
            </span>
          )}
          {isWaiting && <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning">Waiting</span>}
          {isFailed && <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">Failed</span>}
        {isFailed && onResume && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onResume(); }}
            className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/20 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/30 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            Resume
          </button>
        )}
        </p>
        {isRunning && (
          <div className="mt-2.5 w-full">
            <div className="mb-1 flex justify-between text-xs font-semibold text-white">
              <span>Progress</span>
              <span>{progress ?? 0}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, progress ?? 35)}%`, background: 'linear-gradient(90deg, rgba(59,130,246,0.6), rgba(59,130,246,1), rgba(59,130,246,0.6))', backgroundSize: '200% 100%', animation: 'gradientShift 2s ease infinite' }}
              />
            </div>
          </div>
        )}
        <span className="absolute left-3 top-3">
          {isDone && <span className="inline-flex items-center rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">Completed</span>}
          {isWaiting && <span className="inline-flex items-center gap-1 rounded-full bg-warning/20 px-2 py-0.5 text-xs font-semibold text-warning"><Clock3 className="h-3 w-3" />Waiting</span>}
          {isFailed && <span className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-2 py-0.5 text-xs font-semibold text-destructive"><AlertTriangle className="h-3 w-3" />Failed</span>}
        </span>
        <span className="absolute right-3 top-3 text-xs font-semibold text-white/80">
          {isDone && durationLabel}
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
      <style>{RUNNING_ANIMATIONS}</style>
      {/* Input */}
      <button
        type="button"
        onClick={() => onSelectAgent(null)}
        className="w-full rounded-2xl border border-primary/10 bg-card px-5 py-4 text-left shadow-sm"
      >
        <div className="mb-2 flex items-center gap-2.5">
          <Lightbulb className="h-4 w-4 text-warning" />
          <p className="text-sm font-semibold text-foreground">User Idea / Input</p>
          <span className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!dashboard?.projectId) return;
                fetch('/api/projects/' + dashboard.projectId + '/refine-idea', { method: 'POST' })
                  .then((r) => r.json())
                  .then(() => {
                    // Let the refetch happen naturally
                  })
                  .catch(() => {});
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Refine
            </button>
          </span>
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
                          running
                            ? (step?.progress ?? (running ? 50 : undefined))
                            : undefined
                        }
                        selected={selectedAgentKey === agent.agentKey}
                        onSelect={() => onSelectAgent(agent.agentKey, agent.stage)}
                        onResume={status === 'FAILED' && dashboard?.projectId ? () => {
                          fetch(`/api/projects/${dashboard!.projectId}/start`, { method: 'POST' })
                            .catch((e: unknown) => console.error('Resume failed', e));
                        } : undefined}
                        imageSrc={AGENT_ICONS[agent.agentKey]}
                        gradientClass={AGENT_GRADIENTS[agent.agentKey]}
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
        <FileText className="h-6 w-6 shrink-0 text-primary" />
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
