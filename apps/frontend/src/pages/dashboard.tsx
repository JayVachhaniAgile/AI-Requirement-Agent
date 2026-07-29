import { useListProjects, useDeleteProject } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";
import {
  ChevronRight,
  FileText,
  Clock,
  Activity,
  AlertTriangle,
  Eye,
  Download,
  Plus,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_COLORS } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import {
  fetchProjectDashboard,
  getProjectDashboardQueryKey,
} from "@/lib/project-api";

function DashboardCard({ project, onDelete }: { project: any; onDelete?: (id: string) => void }) {
  const [, setLocation] = useLocation();

  const { data: dashboard, isLoading } = useQuery({
    queryKey: getProjectDashboardQueryKey(project.id),
    queryFn: () => fetchProjectDashboard(project.id),
    enabled: !!project.id,
    refetchInterval: false,
  });

  const docStats = dashboard?.documentStats;

  return (
    <Card
      className="group cursor-pointer rounded-2xl border-border shadow-sm hover:border-primary/30 hover:shadow-md transition-all"
      onClick={() => setLocation(`/projects/${project.id}`)}
    >
      <CardHeader className="pb-4">
        <div className="flex justify-between items-start gap-4">
          <CardTitle className="line-clamp-2 text-foreground" title={project.name}>
            {project.name}
          </CardTitle>
          <div className="flex items-center gap-2 shrink-0">
            <Badge
              variant={STATUS_COLORS[project.status] || "default"}
              className="shrink-0"
            >
              {project.status.replace(/_/g, " ")}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.(project.id);
              }}
              title="Delete project"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-2 mb-4 font-mono leading-relaxed">
          {project.idea}
        </p>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : dashboard ? (
          <div className="space-y-4">
            {/* Document Summary */}
            {dashboard.hasDocument && docStats ? (
              <div className="p-3 bg-muted/30 rounded-xl border border-border/50">
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                  Generated Document
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <FileText className="h-3.5 w-3.5 text-primary" />
                    <span><strong>{docStats.sections}</strong> sections</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <FileText className="h-3.5 w-3.5 text-success" />
                    <span><strong>{docStats.pages}</strong> pages</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <FileText className="h-3.5 w-3.5 text-info" />
                    <span><strong>{docStats.diagrams}</strong> diagrams</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <FileText className="h-3.5 w-3.5 text-warning" />
                    <span><strong>{docStats.wordCount.toLocaleString()}</strong> words</span>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-border/50 flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">
                    Confidence: <strong>{dashboard.aiConfidence}%</strong>
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLocation(`/projects/${project.id}?tab=documents`);
                      }}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      View
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <Download className="h-3.5 w-3.5 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-muted/30 rounded-xl border border-dashed border-border text-center">
                <FileText className="h-6 w-6 text-muted-foreground/50 mx-auto mb-1" />
                <p className="text-xs text-muted-foreground/70">No document generated yet</p>
              </div>
            )}

            {/* Project Stats */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="text-center p-2 bg-muted/40 rounded-lg">
                <div className="font-bold text-foreground">{dashboard.requirementCount}</div>
                <div className="text-muted-foreground">Requirements</div>
              </div>
              <div className="text-center p-2 bg-muted/40 rounded-lg">
                <div className="font-bold text-foreground">{dashboard.knowledgeItemCount}</div>
                <div className="text-muted-foreground">Knowledge</div>
              </div>
              <div className="text-center p-2 bg-muted/40 rounded-lg">
                <div className="font-bold text-foreground">{dashboard.completedAgents}/{dashboard.totalAgents}</div>
                <div className="text-muted-foreground">Agents</div>
              </div>
            </div>

            {/* Progress */}
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-muted/50 rounded-full h-1.5">
                <div
                  className="bg-primary h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${dashboard.percentComplete}%` }}
                />
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                {dashboard.percentComplete}%
              </span>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
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
  );
}

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data, isLoading, error, refetch } = useListProjects();
  const projects = Array.isArray(data) ? data : [];
  const deleteProject = useDeleteProject();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteProject.mutateAsync({ id: deleteTarget });
      toast({ title: "Project deleted", description: "Project has been removed." });
      await refetch();
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 md:p-8 space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4 md:p-8">
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-destructive mb-4" />
            <h2 className="text-xl font-bold mb-2">Failed to load dashboard</h2>
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
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Cross-project analytics and pipeline health
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className="text-sm font-semibold text-foreground">{projects.length}</p>
              <p className="text-xs text-muted-foreground">Total Projects</p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div className="text-right">
              <p className="text-sm font-semibold text-success">
                {projects.filter(p => p.status === "COMPLETED").length}
              </p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div className="text-right">
              <p className="text-sm font-semibold text-primary">
                {projects.filter(p => !["COMPLETED", "CREATED", "CANCELLED", "FAILED"].includes(p.status)).length}
              </p>
              <p className="text-xs text-muted-foreground">Running</p>
            </div>
          </div>
          <Button 
            onClick={() => setLocation("/projects/new")} 
            className="gap-2 shrink-0 rounded-xl bg-primary hover:bg-primary-hover ml-10"
          >
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        </div>
      </div>

      {projects.length === 0 ? (
        <Card className="rounded-2xl border-dashed border-2">
          <CardContent className="p-12 text-center flex flex-col items-center justify-center">
            <Activity className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h2 className="text-xl font-bold mb-2 tracking-wide">No Projects Yet</h2>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">
              Start by creating your first project. The autonomous multi-agent system will analyze it and generate a complete requirements document.
            </p>
            <Button onClick={() => setLocation("/projects/new")} className="rounded-xl bg-primary hover:bg-primary-hover">
              Create Your First Project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <DashboardCard key={project.id} project={project} onDelete={(id) => setDeleteTarget(id)} />
          ))}
        </div>
      )}
      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this project? This action cannot be undone. All requirements, documents, and agent data will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleteProject.isPending}
            >
              {deleteProject.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
