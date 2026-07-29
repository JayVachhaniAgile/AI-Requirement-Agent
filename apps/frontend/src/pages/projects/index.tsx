import { useListProjects } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Plus, Clock, AlertTriangle, ChevronRight, Activity } from "lucide-react";
import { format } from "date-fns";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_COLORS } from "@/lib/constants";

export default function ProjectsPage() {
  const { data, isLoading, isFetching, error, refetch } = useListProjects();
  const projects = Array.isArray(data) ? data : [];
  const hasInvalidPayload = data != null && !Array.isArray(data);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (hasInvalidPayload) {
      void refetch();
    }
  }, [hasInvalidPayload, refetch]);

  if (isLoading || (hasInvalidPayload && isFetching)) {
    return (
      <div className="container mx-auto p-4 md:p-8 space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error || hasInvalidPayload) {
    return (
      <div className="container mx-auto p-4 md:p-8">
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-destructive mb-4" />
            <h2 className="text-xl font-bold mb-2">Failed to load projects</h2>
            <p className="text-muted-foreground mb-6">There was an error communicating with the API.</p>
            <Button onClick={() => void refetch()} variant="outline">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Projects</h1>
          <p className="text-muted-foreground text-sm mt-1">Active workspaces & analyses</p>
        </div>
        <Button onClick={() => setLocation("/projects/new")} className="gap-2 shrink-0 rounded-xl bg-primary hover:bg-primary-hover">
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>

      {projects.length === 0 ? (
        <Card className="rounded-2xl border-dashed border-2">
          <CardContent className="p-12 text-center flex flex-col items-center justify-center">
            <Activity className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h2 className="text-xl font-bold mb-2 tracking-wide">No Projects Found</h2>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">
              Start by submitting a software idea. The autonomous multi-agent system will analyze it and generate a complete requirements document.
            </p>
            <Button onClick={() => setLocation("/projects/new")} className="rounded-xl bg-primary hover:bg-primary-hover">Create Your First Project</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="group cursor-pointer rounded-2xl border-border shadow-sm hover:border-primary/30 hover:shadow-md transition-all"
              onClick={() => setLocation(`/projects/${project.id}`)}
            >
              <CardHeader className="pb-4">
                <div className="flex justify-between items-start mb-2 gap-4">
                  <CardTitle className="line-clamp-2" title={project.name}>{project.name}</CardTitle>
                  <Badge variant={STATUS_COLORS[project.status] || "default"} className="shrink-0">
                    {project.status.replace(/_/g, " ")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-3 mb-6 font-mono leading-relaxed">
                  {project.idea}
                </p>

                <div className="flex items-center justify-between mt-auto pt-4 border-t border-border">
                  <div className="flex items-center text-xs text-muted-foreground">
                    <Clock className="h-3 w-3 mr-1" />
                    {format(new Date(project.createdAt), "MMM d, yyyy")}
                  </div>
                  <div className="flex items-center text-xs font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-wider">
                    Open Workspace <ChevronRight className="h-3 w-3 ml-1" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
