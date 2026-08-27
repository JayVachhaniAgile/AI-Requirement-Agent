import { useState } from "react";
import { useListValidationIssues, getListValidationIssuesQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldAlert, AlertTriangle, AlertCircle, Info, XCircle, Lightbulb, ArrowLeftRight, CheckCircle2 } from "lucide-react";
import { STATUS_COLORS } from "@/lib/constants";

export function TabValidation({ projectId }: { projectId: string }) {
  const { data: issues, isLoading } = useListValidationIssues(projectId, {
    query: { enabled: !!projectId, queryKey: getListValidationIssuesQueryKey(projectId) },
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}</div>;
  }

  if (!issues || issues.length === 0) {
    return (
      <div className="text-center p-12 border-2 border-dashed border-border rounded-xl">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success mb-3" />
        <h3 className="text-lg font-semibold">No Issues Detected</h3>
        <p className="text-sm text-muted-foreground mt-1">All requirements are consistent and validated.</p>
      </div>
    );
  }

  const contradictions = issues.filter((i) => i.category === "CONTRADICTION");
  const assumptions = issues.filter((i) => i.category === "ASSUMPTION");
  const otherIssues = issues.filter((i) => i.category !== "CONTRADICTION" && i.category !== "ASSUMPTION");

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "CRITICAL": return <XCircle className="h-5 w-5 text-destructive" />;
      case "HIGH": return <AlertTriangle className="h-5 w-5 text-destructive" />;
      case "MEDIUM": return <AlertCircle className="h-5 w-5 text-warning" />;
      case "LOW": return <Info className="h-5 w-5 text-muted-foreground" />;
      default: return <Info className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const renderIssueCard = (issue: any, isHighlighted?: boolean) => (
    <Card key={issue.id} className={`${isHighlighted ? "border-primary/40 bg-primary/[0.02]" : ""} ${issue.severity === "CRITICAL" ? "border-destructive/40" : ""}`}>
      <CardHeader className="py-3 px-4 border-b bg-muted/20">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {issue.category === "CONTRADICTION" ? (
              <ArrowLeftRight className="h-5 w-5 text-destructive shrink-0" />
            ) : issue.category === "ASSUMPTION" ? (
              <Lightbulb className="h-5 w-5 text-warning shrink-0" />
            ) : (
              getSeverityIcon(issue.severity)
            )}
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                {issue.category === "CONTRADICTION" ? "Contradiction Detected" : issue.category === "ASSUMPTION" ? "Unvalidated Assumption" : `${issue.category} Issue`}
                {issue.requiresHumanDecision && (
                  <Badge variant="destructive" className="text-[10px]">Requires Review</Badge>
                )}
              </CardTitle>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Badge variant={STATUS_COLORS[issue.severity] || "default"}>{issue.severity}</Badge>
            <Badge variant={STATUS_COLORS[issue.status] || "outline"}>{issue.status}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        <p className="text-sm">{issue.problem}</p>
        {issue.impact && (
          <div className="rounded-lg bg-muted/30 p-3 text-sm">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Impact</span>
            <p className="mt-1 text-sm">{issue.impact}</p>
          </div>
        )}
        {issue.recommendedCorrection && (
          <div className="rounded-lg bg-success/10 border border-success/20 p-3">
            <span className="text-xs font-semibold text-success uppercase tracking-wide">Resolution</span>
            <p className="mt-1 text-sm">{issue.recommendedCorrection}</p>
          </div>
        )}
        {issue.evidence && (
          <button
            onClick={() => setExpandedId(expandedId === issue.id ? null : issue.id)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Info className="h-3 w-3" /> Evidence {expandedId === issue.id ? "▲" : "▼"}
          </button>
        )}
        {expandedId === issue.id && issue.evidence && (
          <div className="rounded-lg bg-muted/20 border p-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap">
            {issue.evidence}
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="flex gap-4 flex-wrap">
        {contradictions.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-2">
            <ArrowLeftRight className="h-4 w-4 text-destructive" />
            <span className="text-sm font-semibold text-destructive">{contradictions.length} Contradiction(s)</span>
          </div>
        )}
        {assumptions.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-warning/10 border border-warning/20 px-4 py-2">
            <Lightbulb className="h-4 w-4 text-warning" />
            <span className="text-sm font-semibold text-warning">{assumptions.length} Unvalidated Assumption(s)</span>
          </div>
        )}
        {otherIssues.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-muted border px-4 py-2">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-muted-foreground">{otherIssues.length} Other Issue(s)</span>
          </div>
        )}
      </div>

      {/* Contradictions first */}
      {contradictions.length > 0 && (
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-destructive mb-3 flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4" /> Contradictions
          </h3>
          <div className="space-y-3">{contradictions.map((i) => renderIssueCard(i, true))}</div>
        </div>
      )}

      {/* Assumptions */}
      {assumptions.length > 0 && (
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-warning mb-3 flex items-center gap-2">
            <Lightbulb className="h-4 w-4" /> Unvalidated Assumptions
          </h3>
          <div className="space-y-3">{assumptions.map((i) => renderIssueCard(i))}</div>
        </div>
      )}

      {/* Other issues */}
      {otherIssues.length > 0 && (
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Other Issues</h3>
          <div className="space-y-3">{otherIssues.map((i) => renderIssueCard(i))}</div>
        </div>
      )}
    </div>
  );
}
