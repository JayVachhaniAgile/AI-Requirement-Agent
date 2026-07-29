import type { ProjectDashboard } from "@/lib/dashboard-types";
import { cn } from "@/lib/utils";
import { Clock3, Sparkles, Target } from "lucide-react";
import { Progress } from "@/components/ui/progress";

function formatEta(seconds: number): string {
  if (seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  return `${m} min`;
}

function scoreLabel(score: number): { text: string; className: string } {
  if (score >= 85) return { text: "High", className: "text-success" };
  if (score >= 70) return { text: "Good", className: "text-primary" };
  if (score >= 50) return { text: "Fair", className: "text-warning" };
  return { text: "Low", className: "text-destructive" };
}

function Ring({ value }: { value: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, value)) / 100) * c;
  return (
    <svg width="48" height="48" className="-rotate-90">
      <circle cx="24" cy="24" r={r} stroke="hsl(var(--muted))" strokeWidth="4" fill="none" />
      <circle
        cx="24"
        cy="24"
        r={r}
        stroke="hsl(var(--primary))"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        className="transition-all duration-500"
      />
    </svg>
  );
}

export function ProjectKpiBar({ dashboard }: { dashboard: ProjectDashboard | undefined }) {
  const d = dashboard;
  const completeness = scoreLabel(d?.requirementCompleteness ?? 0);
  const confidence = scoreLabel(d?.aiConfidence ?? 0);
  const agentPct =
    d && d.totalAgents > 0 ? Math.round((d.completedAgents / d.totalAgents) * 100) : 0;

  const cards = [
    {
      key: "progress",
      title: "Overall Progress",
      body: (
        <div className="flex items-center gap-3">
          <div className="relative">
            <Ring value={d?.percentComplete ?? 0} />
            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-foreground">
              {d?.percentComplete ?? 0}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground">Pipeline completion</p>
        </div>
      ),
    },
    {
      key: "agents",
      title: "Completed Agents",
      body: (
        <div className="space-y-2">
          <p className="text-xl font-bold text-foreground">
            {d?.completedAgents ?? 0}
            <span className="text-sm font-medium text-muted-foreground">
              {" "}
              / {d?.totalAgents ?? 14}
            </span>
          </p>
          <Progress value={agentPct} className="h-1.5" />
        </div>
      ),
    },
    {
      key: "step",
      title: "Current Step",
      body: (
        <div className="space-y-1">
          <p className="truncate text-sm font-bold text-foreground">{d?.currentStep ?? "—"}</p>
          <div className="flex items-center gap-1.5 text-xs text-primary">
            {d && !["COMPLETED", "CREATED", "FAILED", "CANCELLED"].includes(d.status) ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                In Progress
              </>
            ) : (
              <span className="text-muted-foreground">{d?.status?.replace(/_/g, " ") ?? "Idle"}</span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "eta",
      title: "Estimated Time Left",
      body: (
        <div className="flex items-center gap-2">
          <Clock3 className="h-5 w-5 text-muted-foreground/70" />
          <p className="text-xl font-bold text-foreground">{formatEta(d?.etaSeconds ?? 0)}</p>
        </div>
      ),
    },
    {
      key: "completeness",
      title: "Requirement Completeness",
      body: (
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-xl font-bold text-foreground">{d?.requirementCompleteness ?? 0}%</p>
            <p className={cn("text-xs font-semibold", completeness.className)}>
              <Target className="mr-1 inline h-3 w-3" />
              {completeness.text}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "confidence",
      title: "AI Confidence",
      body: (
        <div>
          <p className="text-xl font-bold text-foreground">{d?.aiConfidence ?? 0}%</p>
          <p className={cn("text-xs font-semibold", confidence.className)}>
            <Sparkles className="mr-1 inline h-3 w-3" />
            {confidence.text}
          </p>
        </div>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
      {cards.map((card) => (
        <div
          key={card.key}
          className="rounded-2xl border border-border bg-card p-4 shadow-sm"
        >
          <p className="mb-3 text-xs font-semibold text-muted-foreground/70">
            {card.title}
          </p>
          {card.body}
        </div>
      ))}
    </div>
  );
}
