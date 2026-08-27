import { useQuery } from "@tanstack/react-query";
import { BarChart3, Activity, FileText, ShieldCheck, Zap, Clock, CheckCircle2, XCircle, TrendingUp, Brain } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAnalytics, type AnalyticsData } from "@/lib/aggregate-api";
import { cn } from "@/lib/utils";

export default function AnalyticsPage() {
  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["aggregate", "analytics"],
    queryFn: fetchAnalytics,
  });

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const agentStats = [...data.agentStats].sort((a, b) => b.executions - a.executions);
  const maxExecutions = Math.max(...agentStats.map((a) => a.executions), 1);

  const pipelineEntries = Object.entries(data.pipelineStats).sort(
    (a, b) => b[1].completed - a[1].completed
  );

  return (
    <div className="space-y-8 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Analytics</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Token usage, agent performance, and quality trends across all projects
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Total Tokens Used" value={data.tokenTotals.totalTokens.toLocaleString()} icon={<Zap className="h-4 w-4" />} />
        <KPICard label="Total Executions" value={String(data.totalExecutions)} icon={<Activity className="h-4 w-4" />} />
        <KPICard label="Requirements Generated" value={String(data.totalRequirements)} icon={<FileText className="h-4 w-4" />} />
        <KPICard label="Validation Issues" value={String(data.totalIssues)} icon={<ShieldCheck className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Completed Projects" value={String(data.completedProjects)} icon={<CheckCircle2 className="h-4 w-4" />} className="text-success" />
        <KPICard label="Running Projects" value={String(data.runningProjects)} icon={<Activity className="h-4 w-4" />} className="text-primary" />
        <KPICard label="Failed Projects" value={String(data.failedProjects)} icon={<XCircle className="h-4 w-4" />} className="text-destructive" />
        <KPICard
          label="Validation Rate"
          value={data.totalRequirements > 0 ? `${Math.round((data.validatedRequirements / data.totalRequirements) * 100)}%` : "—"}
          icon={<TrendingUp className="h-4 w-4" />}
          className="text-info"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Agent Performance */}
        <Card className="rounded-2xl border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm">Agent Performance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {agentStats.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No agent executions recorded yet</p>
            ) : (
              agentStats.slice(0, 10).map((a) => (
                <div key={a.agentKey} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-32 truncate font-medium">{a.agentKey}</span>
                  <div className="flex-1 bg-muted/40 rounded-full h-2 relative">
                    <div
                      className={cn("h-2 rounded-full transition-all", a.successRate >= 90 ? "bg-success/100" : a.successRate >= 70 ? "bg-warning/100" : "bg-destructive/100")}
                      style={{ width: `${(a.executions / maxExecutions) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-muted-foreground w-12 text-right">{a.executions}×</span>
                  <span className="text-xs font-mono text-muted-foreground w-12 text-right">{a.successRate}%</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Pipeline Stage Health */}
        <Card className="rounded-2xl border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm">Pipeline Stage Completion</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pipelineEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No pipeline stages run yet</p>
            ) : (
              pipelineEntries.map(([stage, stats]) => {
                const pct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
                return (
                  <div key={stage} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground font-medium truncate">{stage.replace(/_/g, " ")}</span>
                      <span className="text-[10px] text-muted-foreground">{stats.completed}/{stats.total}</span>
                    </div>
                    <div className="flex-1 bg-muted/40 rounded-full h-1.5">
                      <div className="bg-primary h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Token Breakdown */}
        <Card className="rounded-2xl border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm">Token Usage Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Input Tokens</p>
                <p className="text-2xl font-bold text-foreground">{data.tokenTotals.inputTokens.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Output Tokens</p>
                <p className="text-2xl font-bold text-foreground">{data.tokenTotals.outputTokens.toLocaleString()}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <div className="flex-1 bg-muted/40 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-primary h-3 rounded-l-full"
                  style={{
                    width: `${data.tokenTotals.totalTokens > 0 ? (data.tokenTotals.inputTokens / data.tokenTotals.totalTokens) * 100 : 50}%`,
                  }}
                />
              </div>
              <div className="flex-1 bg-muted/40 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-success/100 h-3 rounded-r-full"
                  style={{
                    width: `${data.tokenTotals.totalTokens > 0 ? (data.tokenTotals.outputTokens / data.tokenTotals.totalTokens) * 100 : 50}%`,
                  }}
                />
              </div>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>{data.tokenTotals.totalTokens > 0 ? Math.round((data.tokenTotals.inputTokens / data.tokenTotals.totalTokens) * 100) : 50}% input</span>
              <span>{data.tokenTotals.totalTokens > 0 ? Math.round((data.tokenTotals.outputTokens / data.tokenTotals.totalTokens) * 100) : 50}% output</span>
            </div>
          </CardContent>
        </Card>

        {/* Quality Summary */}
        <Card className="rounded-2xl border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm">Quality Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
              <span className="text-xs text-muted-foreground">Requirements</span>
              <div className="flex gap-2">
                <Badge variant="outline" className="text-[10px]">
                  <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-success/100" />
                  {data.validatedRequirements} validated
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {data.totalRequirements - data.validatedRequirements} other
                </Badge>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
              <span className="text-xs text-muted-foreground">Critical Issues</span>
              <Badge variant={data.criticalIssues > 0 ? "destructive" : "outline"} className="text-[10px]">
                <Brain className="h-3 w-3 mr-1" />
                {data.criticalIssues}
              </Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
              <span className="text-xs text-muted-foreground">Open Issues</span>
              <Badge variant={data.openIssues > 0 ? "warning" : "outline"} className="text-[10px]">
                {data.openIssues}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KPICard({ label, value, icon, className }: { label: string; value: string; icon: React.ReactNode; className?: string }) {
  return (
    <Card className="rounded-2xl border-border shadow-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-muted/40", className ?? "text-muted-foreground")}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-lg font-bold text-foreground truncate">{value}</p>
          <p className="text-[11px] text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
