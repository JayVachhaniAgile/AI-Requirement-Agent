import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  CheckCircle2,
  Clock3,
  FileText,
  Lightbulb,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkflowNodeData = {
  label: string;
  kind: "input" | "agent" | "final";
  status: string;
  index?: number;
  durationLabel?: string;
  progress?: number;
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
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lightbulb className="h-5 w-5" />
          </span>
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
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileText className="h-7 w-7" />
          </span>
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
        "relative w-[290px] rounded-2xl border bg-card px-4 py-3.5 text-left shadow-sm transition-shadow hover:shadow-md",
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

      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-primary-foreground",
            isDone && "bg-success",
            isRunning && "bg-primary",
            isWaiting && "bg-warning/60",
            isFailed && "bg-destructive",
          )}
        >
          {d.index}
        </span>

        <div className="min-w-0 flex-1 pr-7">
          <p className="truncate text-[15px] font-semibold text-foreground">{d.label}</p>

          <div className="mt-1.5 flex items-center gap-1.5">
            <span
              className={cn(
                "text-xs font-semibold",
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
            </span>
          </div>

          {d.durationLabel && (
            <p className="mt-1 text-xs text-muted-foreground/70">{d.durationLabel}</p>
          )}

          {isRunning && (
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs font-semibold text-primary">
                <span>Progress</span>
                <span>{d.progress ?? 0}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-primary/20">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${Math.min(100, d.progress ?? 35)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <span className="absolute right-3.5 top-3.5">
          {isDone && <CheckCircle2 className="h-5 w-5 text-success" />}
          {isWaiting && <Clock3 className="h-5 w-5 text-warning/70" />}
          {isFailed && <AlertTriangle className="h-5 w-5 text-destructive" />}
        </span>
      </div>

      <Handle
        type="source"
        position={sourcePos}
        className="!h-2.5 !w-2.5 !border-2 !border-card !bg-muted/60"
      />
    </button>
  );
}

export const WorkflowNode = memo(WorkflowNodeComponent);
