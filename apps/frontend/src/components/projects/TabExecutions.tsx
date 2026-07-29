import { useListExecutions, getListExecutionsQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Terminal, Cpu, Clock } from "lucide-react";
import { format } from "date-fns";

export function TabExecutions({ projectId }: { projectId: string }) {
  const { data: executions, isLoading } = useListExecutions(projectId, {
    query: {
      enabled: !!projectId,
      queryKey: getListExecutionsQueryKey(projectId),
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  if (!executions || executions.length === 0) {
    return (
      <div className="text-center p-12 border-2 border-dashed border-border text-muted-foreground uppercase tracking-widest text-sm font-bold">
        No agent executions recorded
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {executions.map((exec) => (
        <Card key={exec.id} className="rounded-none">
          <CardContent className="p-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4 border-l-4 border-l-primary">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-muted rounded-full">
                  <Terminal className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-base uppercase tracking-wider">{exec.agentKey}</h4>
                    <Badge variant={
                      exec.status === 'COMPLETED' ? 'success' :
                      exec.status === 'RUNNING' ? 'default' :
                      exec.status === 'FAILED' ? 'destructive' : 'secondary'
                    }>
                      {exec.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground font-mono">
                    <span className="flex items-center gap-1">
                      <Cpu className="h-3 w-3" /> {exec.model || 'unknown_model'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> 
                      {exec.startedAt ? format(new Date(exec.startedAt), "HH:mm:ss") : 'Queued'}
                    </span>
                  </div>
                </div>
              </div>

              {(exec.inputTokens != null || exec.outputTokens != null) && (
                <div className="flex gap-4 text-xs font-mono bg-muted/50 p-2 border border-border">
                  <div className="flex flex-col items-end">
                    <span className="text-muted-foreground">In Tokens</span>
                    <span className="font-bold">{exec.inputTokens || 0}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-muted-foreground">Out Tokens</span>
                    <span className="font-bold">{exec.outputTokens || 0}</span>
                  </div>
                </div>
              )}
            </div>
            {exec.error && (
              <div className="px-4 py-3 bg-destructive/10 text-destructive text-sm font-mono border-t border-destructive/20">
                {exec.error}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
