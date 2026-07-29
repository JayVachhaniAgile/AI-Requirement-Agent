import { useListRequirements, getListRequirementsQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUS_COLORS } from "@/lib/constants";

export function TabRequirements({ projectId }: { projectId: string }) {
  const { data: requirements, isLoading } = useListRequirements(projectId, {
    query: {
      enabled: !!projectId,
      queryKey: getListRequirementsQueryKey(projectId),
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
      </div>
    );
  }

  if (!requirements || requirements.length === 0) {
    return (
      <div className="text-center p-12 border-2 border-dashed border-border text-muted-foreground uppercase tracking-widest text-sm font-bold">
        No requirements generated yet
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {requirements.map((req) => (
        <Card key={req.id} className="hover:border-primary/50 transition-colors">
          <CardHeader className="py-3 px-4 border-b border-border/50 bg-muted/30 flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="font-mono bg-background">
                {req.externalId || req.id.substring(0, 8)}
              </Badge>
              <CardTitle className="text-base lowercase normal-case">{req.title}</CardTitle>
            </div>
            <Badge variant={STATUS_COLORS[req.status] || "default"}>
              {req.status}
            </Badge>
          </CardHeader>
          <CardContent className="p-4">
            <p className="text-sm font-mono text-muted-foreground whitespace-pre-wrap">
              {req.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
