import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  CheckCircle2,
  Clock3,
  AlertTriangle,
  Lightbulb,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

const AGENT_IMAGES: Record<string, string> = {
  Discovery: "/agentBackgrounds/Discovery.png",
  Research: "/agentBackgrounds/Research.png",
  "Business Analyst": "/agentBackgrounds/BusinessAnalyst.png",
  "Product Manager": "/agentBackgrounds/ProductManager.png",
  "Requirements Agent": "/agentBackgrounds/RequirementAgent.png",
  "UX Agent": "/agentBackgrounds/UXAgent.png",
  "Data Architect": "/agentBackgrounds/DataArchitect.png",
  "AI Architect": "/agentBackgrounds/AIArchitect.png",
  "Solution Architect": "/agentBackgrounds/SolutionArchitect.png",
  "Security Agent": "/agentBackgrounds/SecurityAgent.png",
  "QA Agent": "/agentBackgrounds/QAAgent.png",
  Estimation: "/agentBackgrounds/EstimationAgent.png",
  Critic: "/agentBackgrounds/ValidationAgent.png",
  Debate: "/agentBackgrounds/ValidationAgent.png",
  Compiler: "/agentBackgrounds/CompilationAgent.png",
};

const AGENT_GRADIENTS: Record<string, string> = {
  Discovery: "bg-gradient-to-br from-blue-600 to-purple-700",
  Research: "bg-gradient-to-br from-cyan-500 to-blue-600",
  "Business Analyst": "bg-gradient-to-br from-green-500 to-emerald-600",
  "Product Manager": "bg-gradient-to-br from-orange-600 to-amber-700",
  "Requirements Agent": "bg-gradient-to-br from-teal-500 to-cyan-600",
  "UX Agent": "bg-gradient-to-br from-purple-500 to-pink-600",
  "Data Architect": "bg-gradient-to-br from-indigo-500 to-purple-600",
  "AI Architect": "bg-gradient-to-br from-cyan-500 to-teal-700",
  "Solution Architect": "bg-gradient-to-br from-amber-600 to-yellow-700",
  "Security Agent": "bg-gradient-to-br from-red-500 to-rose-600",
  "QA Agent": "bg-gradient-to-br from-emerald-500 to-green-600",
  Estimation: "bg-gradient-to-br from-yellow-600 to-orange-700",
  Critic: "bg-gradient-to-br from-violet-500 to-purple-700",
  Debate: "bg-gradient-to-br from-orange-500 to-red-600",
  Compiler: "bg-gradient-to-br from-primary to-primary/80",
};

export type WorkflowNodeData = {
  label: string;
  kind: "input" | "agent" | "final";
  status: string;
  index?: number;
  durationLabel?: string;
  ideaPreview?: string;
  selected?: boolean;
  onSelect?: () => void;
  /** Which side to attach source/target handles for sequential routing */
  sourceSide?: "bottom" | "right" | "left";
  targetSide?: "top" | "left" | "right";
};

function WorkflowNodeComponent({ data }: NodeProps) {
  const d = data as WorkflowNodeData;
  const isRunning = d.status === "RUNNING";
  const isDone = d.status === "COMPLETED";
  const isFailed = d.status === "FAILED";
  const isWaiting = !isRunning && !isDone && !isFailed;

  const sourcePos =
    d.sourceSide === "right"
      ? Position.Right
      : d.sourceSide === "left"
        ? Position.Left
        : Position.Bottom;
  const targetPos =
    d.targetSide === "left"
      ? Position.Left
      : d.targetSide === "right"
        ? Position.Right
        : Position.Top;

  if (d.kind === "input") {
    return (
      <button
        type="button"
        onClick={d.onSelect}
        className="w-[920px] rounded-2xl border border-primary/10 bg-card px-6 py-5 text-left shadow-sm"
      >
        <Handle
          type="source"
          position={Position.Bottom}
          className="!h-2.5 !w-2.5 !border-2 !border-card !bg-primary/40"
        />
        <div className="mb-2 flex items-center gap-2.5">
          <Lightbulb className="h-5 w-5 text-warning" />
          <p className="text-base font-semibold text-foreground">User Idea / Input</p>
        </div>
        {d.ideaPreview ? (
          <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{d.ideaPreview}</p>
        ) : (
          <p className="text-sm text-muted-foreground/70">No idea text yet</p>
        )}
      </button>
    );
  }

  if (d.kind === "final") {
    return (
      <button
        type="button"
        onClick={d.onSelect}
        className={cn(
          "w-[920px] rounded-2xl border bg-card px-6 py-5 text-left shadow-sm",
          isDone ? "border-success/20" : "border-primary/20",
        )}
      >
        <Handle
          type="target"
          position={Position.Top}
          className="!h-2.5 !w-2.5 !border-2 !border-card !bg-primary/40"
        />
        <div className="flex items-center gap-4">
          <FileText className="h-7 w-7 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-foreground">Requirement Document</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {isDone
                ? "Final output is ready for export."
                : "Final output will be ready for export."}
            </p>
          </div>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold",
              isDone ? "bg-success/10 text-success" : "bg-warning/10 text-warning",
            )}
          >
            {isDone ? "Ready" : "Pending"}
          </span>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={d.onSelect}
      className={cn(
        "relative w-[290px] min-h-[140px] overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-shadow hover:shadow-md",
        isDone && "border-success/30",
        isRunning && "border-primary/50 shadow-[0_0_0_3px_hsl(var(--primary)/0.15)]",
        isWaiting && "border-warning/30",
        isFailed && "border-destructive/30",
        d.selected && "ring-2 ring-primary/30",
      )}
    >
      <Handle
        type="target"
        position={targetPos}
        className="!h-2.5 !w-2.5 !border-2 !border-card !bg-muted/60"
      />

      {AGENT_IMAGES[d.label] && (
        <img
          src={AGENT_IMAGES[d.label]}
          alt={d.label}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div className={`absolute inset-0 ${AGENT_GRADIENTS[d.label] ?? "bg-black/70"} opacity-80`} />

      <div className="relative z-10 flex flex-col p-3.5">
        <div className="mb-1 flex items-center gap-2">
          <span
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/90 text-xs font-bold text-gray-800",
              isDone && "bg-success",
              isRunning && "bg-primary",
              isWaiting && "bg-warning/60",
              isFailed && "bg-destructive",
            )}
          >
            {d.index}
          </span>
          <p className="truncate text-[15px] font-semibold text-white">{d.label}</p>
        </div>

        <div className="mt-1.5 flex items-center gap-1.5">
          <span
            className={cn(
              "text-xs font-semibold",
              isDone && "text-green-200",
              isRunning && "text-blue-200",
              isWaiting && "text-yellow-200",
              isFailed && "text-red-200",
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
          </span>
        </div>

        {d.durationLabel && (
          <p className="mt-1 text-xs text-white/80">{d.durationLabel}</p>
        )}

      </div>

      <span className="absolute right-3.5 top-3.5">
        {isDone && <span className="inline-flex items-center rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">Completed</span>}
        {isWaiting && <Clock3 className="h-5 w-5 text-yellow-200/80" />}
        {isFailed && <AlertTriangle className="h-5 w-5 text-red-200" />}
      </span>

      <Handle
        type="source"
        position={sourcePos}
        className="!h-2.5 !w-2.5 !border-2 !border-card !bg-muted/60"
      />
    </button>
  );
}

export const WorkflowNode = memo(WorkflowNodeComponent);
