import type { WorkflowStep } from "@workspace/api-client-react";
import { CheckCircle2, CircleDashed, AlertTriangle, FileCheck2, User } from "lucide-react";
import { cn } from "@/lib/utils";

type NodeKind = "user" | "agent" | "final";

interface TimelineNode {
  id: string;
  label: string;
  stage?: string;
  kind: NodeKind;
}

const LINEAR_BEFORE_FORK: TimelineNode[] = [
  { id: "user", label: "User", kind: "user" },
  { id: "discovery", label: "Discovery Agent", stage: "DISCOVERY", kind: "agent" },
  { id: "research", label: "Research Agent", stage: "RESEARCH", kind: "agent" },
  { id: "ba", label: "Business Analyst", stage: "BUSINESS_ANALYSIS", kind: "agent" },
  { id: "pm", label: "Product Manager", stage: "PRODUCT_ANALYSIS", kind: "agent" },
  { id: "req", label: "Requirements Agent", stage: "REQUIREMENTS_ENGINEERING", kind: "agent" },
  { id: "ux", label: "UX Agent", stage: "UX_DESIGN", kind: "agent" },
];

const FORK_LEFT: TimelineNode = {
  id: "data",
  label: "Data Architect",
  stage: "DATA_ARCHITECTURE",
  kind: "agent",
};

const FORK_RIGHT: TimelineNode = {
  id: "ai",
  label: "AI Architect",
  stage: "AI_ARCHITECTURE",
  kind: "agent",
};

const LINEAR_AFTER_FORK: TimelineNode[] = [
  { id: "solution", label: "Solution Architect", stage: "SOLUTION_ARCHITECTURE", kind: "agent" },
  { id: "security", label: "Security", stage: "SECURITY_REVIEW", kind: "agent" },
  { id: "qa", label: "QA", stage: "QA_PLANNING", kind: "agent" },
  { id: "estimation", label: "Estimation", stage: "ESTIMATION", kind: "agent" },
  { id: "critic", label: "Critic", stage: "VALIDATION", kind: "agent" },
  { id: "compiler", label: "Compiler", stage: "COMPILATION", kind: "agent" },
  { id: "final", label: "Final Documentation", kind: "final" },
];

function resolveStatus(
  node: TimelineNode,
  stepsByStage: Map<string, WorkflowStep>,
  projectCompleted: boolean,
): string {
  if (node.kind === "user") return "COMPLETED";
  if (node.kind === "final") return projectCompleted ? "COMPLETED" : "QUEUED";
  if (!node.stage) return "QUEUED";
  return stepsByStage.get(node.stage)?.status ?? "QUEUED";
}

function StatusGlyph({ status }: { status: string }) {
  if (status === "COMPLETED") {
    return <CheckCircle2 className="h-4 w-4 text-success" />;
  }
  if (status === "RUNNING") {
    return <ActivityIcon className="h-4 w-4 text-primary animate-pulse" />;
  }
  if (status === "FAILED") {
    return <AlertTriangle className="h-4 w-4 text-destructive" />;
  }
  return <CircleDashed className="h-4 w-4 text-muted-foreground/70" />;
}

function Connector() {
  return (
    <div className="flex flex-col items-center py-1" aria-hidden>
      <div className="h-3 w-px bg-border" />
      <div className="text-xs text-muted-foreground">▼</div>
    </div>
  );
}

function NodeCard({
  node,
  status,
}: {
  node: TimelineNode;
  status: string;
}) {
  const isRunning = status === "RUNNING";
  const isDone = status === "COMPLETED";
  const isFailed = status === "FAILED";

  return (
    <div
      className={cn(
        "relative w-full max-w-[280px] border px-4 py-3 transition-colors",
        node.kind === "user" && "bg-secondary text-secondary-foreground border-secondary",
        node.kind === "final" && "bg-primary/10 border-primary/40",
        node.kind === "agent" && "bg-card",
        isRunning && "border-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.25)]",
        isDone && node.kind === "agent" && "border-success/40 bg-success/5",
        isFailed && "border-destructive/50 bg-destructive/5",
      )}
    >
      <div className="flex items-center gap-3">
        <div className="shrink-0">
          {node.kind === "user" ? (
            <User className="h-4 w-4" />
          ) : node.kind === "final" ? (
            <FileCheck2 className="h-4 w-4 text-primary" />
          ) : (
            <StatusGlyph status={status} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm font-bold tracking-wide",
              node.kind === "final" && "uppercase text-primary",
            )}
          >
            {node.label}
          </p>
          {node.kind === "agent" && (
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              {status.replace(/_/g, " ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function AgentPipelineTimeline({
  steps,
  projectStatus,
}: {
  steps: WorkflowStep[] | undefined;
  projectStatus: string;
}) {
  const stepsByStage = new Map((steps ?? []).map((s) => [s.stage, s]));
  const projectCompleted = projectStatus === "COMPLETED";

  const statusOf = (node: TimelineNode) =>
    resolveStatus(node, stepsByStage, projectCompleted);

  const leftStatus = statusOf(FORK_LEFT);
  const rightStatus = statusOf(FORK_RIGHT);

  return (
    <div className="flex flex-col items-center">
      {LINEAR_BEFORE_FORK.map((node, index) => (
        <div key={node.id} className="flex w-full flex-col items-center">
          {index > 0 && <Connector />}
          <NodeCard node={node} status={statusOf(node)} />
        </div>
      ))}

      {/* Fork: Data Architect || AI Architect */}
      <div className="flex w-full max-w-[520px] flex-col items-center">
        <Connector />
        <div className="relative grid w-full grid-cols-2 gap-4">
          <div
            className="pointer-events-none absolute inset-x-[25%] top-0 h-4 border-t border-l border-r border-border"
            aria-hidden
          />
          <div className="flex flex-col items-center pt-4">
            <div className="mb-1 text-[10px] text-muted-foreground">▼</div>
            <NodeCard node={FORK_LEFT} status={leftStatus} />
          </div>
          <div className="flex flex-col items-center pt-4">
            <div className="mb-1 text-[10px] text-muted-foreground">▼</div>
            <NodeCard node={FORK_RIGHT} status={rightStatus} />
          </div>
          <div
            className="pointer-events-none absolute inset-x-[25%] bottom-0 h-4 border-b border-l border-r border-border"
            aria-hidden
          />
        </div>
        <div className="mt-4 flex flex-col items-center">
          <div className="h-3 w-px bg-border" />
          <div className="text-xs text-muted-foreground">▼</div>
        </div>
      </div>

      {LINEAR_AFTER_FORK.map((node) => (
        <div key={node.id} className="flex w-full flex-col items-center">
          {node.id !== "solution" && <Connector />}
          <NodeCard node={node} status={statusOf(node)} />
        </div>
      ))}
    </div>
  );
}

function ActivityIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}
