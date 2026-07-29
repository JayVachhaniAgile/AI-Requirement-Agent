import { useListValidationIssues, getListValidationIssuesQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { STATUS_COLORS } from "@/lib/constants";

export function TabValidation({ projectId }: { projectId: string }) {
  const { data: issues, isLoading } = useListValidationIssues(projectId, {
    query: {
      enabled: !!projectId,
      queryKey: getListValidationIssuesQueryKey(projectId),
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
      </div>
    );
  }

  if (!issues || issues.length === 0) {
    return (
      <div className="text-center p-12 border-2 border-dashed border-border text-muted-foreground uppercase tracking-widest text-sm font-bold">
        No validation issues detected
      </div>
    );
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return <ShieldAlert className="h-5 w-5 text-destructive" />;
      case 'HIGH': return <AlertTriangle className="h-5 w-5 text-destructive" />;
      case 'MEDIUM': return <AlertCircle className="h-5 w-5 text-warning" />;
      case 'LOW': return <Info className="h-5 w-5 text-secondary" />;
      default: return <Info className="h-5 w-5 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-4">
      {issues.map((issue) => (
        <Card key={issue.id} className={issue.severity === 'CRITICAL' ? 'border-destructive' : ''}>
          <CardHeader className="py-3 px-4 border-b border-border/50 bg-muted/30 flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              {getSeverityIcon(issue.severity)}
              <CardTitle className="text-base">
                {issue.category} Issue
              </CardTitle>
            </div>
            <div className="flex gap-2">
              <Badge variant={STATUS_COLORS[issue.severity] || "default"}>
                {issue.severity}
              </Badge>
              <Badge variant={STATUS_COLORS[issue.status] || "outline"}>
                {issue.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Problem</span>
              <p className="text-sm font-mono text-foreground mt-1">{issue.problem}</p>
            </div>
            
            {issue.recommendedCorrection && (
              <div className="p-3 bg-success/10 border border-success/30 rounded-none">
                <span className="text-xs font-bold uppercase tracking-wider text-success">Recommended Correction</span>
                <p className="text-sm font-mono text-foreground mt-1">{issue.recommendedCorrection}</p>
              </div>
            )}
            
            {issue.evidence && (
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Evidence</span>
                <p className="text-xs font-mono text-muted-foreground mt-1">{issue.evidence}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
