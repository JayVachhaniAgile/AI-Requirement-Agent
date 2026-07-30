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
  const r = 28;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, value)) / 100) * c;
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" className="-rotate-90" fill="none">
      <circle cx="36" cy="36" r={r} stroke="hsl(var(--muted))" strokeWidth="5" />
      <circle
        cx="36"
        cy="36"
        r={r}
        stroke="hsl(var(--primary))"
        strokeWidth="4"
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
          <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center">
            <Ring value={d?.percentComplete ?? 0} />
            <span className="absolute text-sm font-bold text-foreground">
              {d?.percentComplete ?? 0}%
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-foreground/90">Pipeline completion</p>
            <p className="mt-0.5 text-xs text-muted-foreground/70">
              {d?.completedAgents ?? 0} / {d?.totalAgents ?? 15} agents
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "agents",
      title: "Completed Agents",
      body: (
        <div className="flex flex-col justify-center gap-1.5">
          <p className="text-xl font-bold text-foreground leading-tight">
            {d?.completedAgents ?? 0}
            <span className="text-sm font-medium text-muted-foreground">
              {" / "}{d?.totalAgents ?? 15}
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
        <div className="flex flex-col justify-center gap-1.5">
          <p className="truncate text-sm font-semibold text-foreground leading-tight">{d?.currentStep ?? "—"}</p>
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
          <Clock3 className="h-5 w-5 shrink-0 text-muted-foreground/70" />
          <p className="text-xl font-bold text-foreground leading-tight">{formatEta(d?.etaSeconds ?? 0)}</p>
        </div>
      ),
    },
    {
      key: "completeness",
      title: "Requirement Completeness",
      body: (
        <div className="flex flex-col justify-center gap-1">
          <p className="text-xl font-bold text-foreground leading-tight">{d?.requirementCompleteness ?? 0}%</p>
          <p className={cn("text-xs font-semibold", completeness.className)}>
            <Target className="mr-1 inline h-3 w-3" />
            {completeness.text}
          </p>
        </div>
      ),
    },
    {
      key: "confidence",
      title: "AI Confidence",
      body: (
        <div className="flex items-center gap-3">
          <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center">
            <Ring value={d?.aiConfidence ?? 0} />
            <span className="absolute text-sm font-bold text-foreground">
              {d?.aiConfidence ?? 0}%
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className={cn("text-xs font-semibold", confidence.className)}>
              <Sparkles className="mr-1 inline h-3 w-3" />
              {confidence.text}
            </p>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {cards.map((card) => (
        <div
          key={card.key}
          className="flex flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-sm"
        >
          <p className="mb-3 text-xs font-semibold text-muted-foreground/70">
            {card.title}
          </p>
          <div className="flex-1">
            {card.body}
          </div>
        </div>
      ))}
    </div>
  );
}
