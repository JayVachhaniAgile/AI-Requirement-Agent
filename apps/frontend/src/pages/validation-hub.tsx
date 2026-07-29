import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, AlertTriangle, Search, Filter, CheckCircle2, ChevronRight, ShieldAlert, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fetchAllValidation, type AggValidationIssue } from "@/lib/aggregate-api";
import { STATUS_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export default function ValidationHubPage() {
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<AggValidationIssue | null>(null);

  const { data: issues, isLoading } = useQuery<AggValidationIssue[]>({
    queryKey: ["aggregate", "validation"],
    queryFn: fetchAllValidation,
  });

  const filtered = (issues ?? []).filter((i) => {
    if (search && !i.problem.toLowerCase().includes(search.toLowerCase()) && !(i.category ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    if (severityFilter && i.severity !== severityFilter) return false;
    if (statusFilter && i.status !== statusFilter) return false;
    return true;
  });

  const severities = Array.from(new Set((issues ?? []).map((i) => i.severity)));
  const statuses = Array.from(new Set((issues ?? []).map((i) => i.status)));

  const stats = {
    total: issues?.length ?? 0,
    critical: issues?.filter((i) => i.severity === "CRITICAL").length ?? 0,
    high: issues?.filter((i) => i.severity === "HIGH").length ?? 0,
    open: issues?.filter((i) => i.status === "OPEN").length ?? 0,
    resolved: issues?.filter((i) => i.status === "RESOLVED").length ?? 0,
  };

  const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Validation</h1>
        <p className="text-muted-foreground text-sm mt-1">Organization-wide validation findings and quality metrics</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard label="Total Issues" value={stats.total} icon={<ShieldAlert className="h-4 w-4" />} />
            <StatCard label="Critical" value={stats.critical} icon={<AlertTriangle className="h-4 w-4" />} className="text-destructive" highlight />
            <StatCard label="High" value={stats.high} icon={<AlertTriangle className="h-4 w-4" />} className="text-destructive" />
            <StatCard label="Open" value={stats.open} icon={<XCircle className="h-4 w-4" />} className="text-destructive" />
            <StatCard label="Resolved" value={stats.resolved} icon={<CheckCircle2 className="h-4 w-4" />} className="text-success" />
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
              <Input
                placeholder="Search issues…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 rounded-xl"
              />
            </div>
            <select
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
              value={severityFilter ?? ""}
              onChange={(e) => setSeverityFilter(e.target.value || null)}
            >
              <option value="">All Severities</option>
              {severities.sort((a, b) => SEVERITY_ORDER.indexOf(a) - SEVERITY_ORDER.indexOf(b)).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
              value={statusFilter ?? ""}
              onChange={(e) => setStatusFilter(e.target.value || null)}
            >
              <option value="">All Statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-6">
            <Card className="rounded-2xl border-border shadow-sm">
              <CardContent className="p-0">
                {filtered.length > 0 ? (
                  <div className="divide-y divide-border/50">
                    <div className="grid grid-cols-6 gap-4 px-6 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground/70 bg-muted/40">
                      <span className="col-span-2">Problem</span>
                      <span>Project</span>
                      <span>Severity</span>
                      <span>Status</span>
                      <span></span>
                    </div>
                    {filtered.map((i) => (
                      <button
                        key={i.id}
                        onClick={() => setSelectedIssue(selectedIssue?.id === i.id ? null : i)}
                        className="w-full grid grid-cols-6 gap-4 px-6 py-3 text-sm items-center hover:bg-muted/30 transition-colors text-left"
                      >
                        <div className="col-span-2 min-w-0">
                          <p className="font-medium text-foreground truncate">{i.problem}</p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{i.category}</p>
                        </div>
                        <span className="text-xs text-muted-foreground truncate">{i.projectName}</span>
                        <SeverityBadge severity={i.severity} />
                        <Badge variant={STATUS_COLORS[i.status] || "default"} className="w-fit text-[10px]">
                          {i.status.replace(/_/g, " ")}
                        </Badge>
                        <ChevronRight className={cn("h-4 w-4 text-muted-foreground/70 transition-transform", selectedIssue?.id === i.id && "rotate-90")} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-12 text-center">
                    <ShieldCheck className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No validation issues found</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {selectedIssue && (
              <Card className="rounded-2xl border-border shadow-sm h-fit">
                <CardHeader>
                  <CardTitle className="text-sm">Issue Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground/70 mb-1">Problem</p>
                    <p className="text-sm text-foreground">{selectedIssue.problem}</p>
                  </div>
                  {selectedIssue.evidence && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground/70 mb-1">Evidence</p>
                      <p className="text-xs text-muted-foreground bg-muted/40 p-3 rounded-xl font-mono">{selectedIssue.evidence}</p>
                    </div>
                  )}
                  {selectedIssue.impact && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground/70 mb-1">Impact</p>
                      <p className="text-sm text-foreground">{selectedIssue.impact}</p>
                    </div>
                  )}
                  {selectedIssue.recommendedCorrection && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground/70 mb-1">Recommended Correction</p>
                      <p className="text-sm text-foreground">{selectedIssue.recommendedCorrection}</p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50">
                    <Badge variant={STATUS_COLORS[selectedIssue.severity] || "default"}>{selectedIssue.severity}</Badge>
                    <Badge variant="outline">{selectedIssue.category}</Badge>
                    <Badge variant="outline">{selectedIssue.sourceAgent ?? "—"}</Badge>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    CRITICAL: "bg-destructive/15 text-destructive border-destructive/20",
    HIGH: "bg-warning/15 text-warning border-orange-200",
    MEDIUM: "bg-warning/15 text-warning border-warning/20",
    LOW: "bg-muted/40 text-muted-foreground border-border",
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${colors[severity] ?? "bg-muted/40 text-muted-foreground border-border"}`}>
      {severity}
    </span>
  );
}

function StatCard({ label, value, icon, className, highlight }: { label: string; value: number; icon: React.ReactNode; className?: string; highlight?: boolean }) {
  return (
    <Card className={cn("rounded-2xl border-border shadow-sm", highlight && "border-destructive/20 bg-destructive/10/30")}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-muted/40 ${className ?? "text-muted-foreground"}`}>
          {icon}
        </div>
        <div>
          <p className="text-xl font-bold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
