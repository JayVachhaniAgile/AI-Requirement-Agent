import { useGetDocument, useGetProject, useListKnowledgeItems, useStartProject, useCancelProject, getListKnowledgeItemsQueryKey, getGetDocumentQueryKey } from "@workspace/api-client-react";
import { useLocation, useParams } from "wouter";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Play, XOctagon, Lightbulb } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { getGetProjectQueryKey, getGetProjectProgressQueryKey } from "@workspace/api-client-react";
import {
  fetchProjectDashboard,
  getProjectDashboardQueryKey,
} from "@/lib/project-api";
import { useProjectSocket } from "@/hooks/use-project-socket";
import { useWorkspaceHeader } from "@/components/layouts/workspace-header-context";
import { ProjectKpiBar } from "@/components/projects/ProjectKpiBar";
import { WorkflowPipeline } from "@/components/projects/workflow/WorkflowPipeline";
import { AgentLivePanel } from "@/components/projects/AgentLivePanel";
import { DocumentSummaryFooter } from "@/components/projects/DocumentSummaryFooter";
import { TabExecutions } from "@/components/projects/TabExecutions";
import { TabDocument } from "@/components/projects/TabDocument";
import { TabValidation } from "@/components/projects/TabValidation";
import { TabQuestions } from "@/components/projects/TabQuestions";
import { TabRequirements } from "@/components/projects/TabRequirements";

const RUNNING_STATUSES = [
  "DISCOVERING",
  "RESEARCHING",
  "ANALYSING",
  "GENERATING_REQUIREMENTS",
  "DESIGNING",
  "ARCHITECTING",
  "SECURITY_REVIEW",
  "QA_ANALYSIS",
  "ESTIMATING",
  "VALIDATING",
  "COMPILING",
] as const;

export default function ProjectWorkspace() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { setWorkspaceHeader } = useWorkspaceHeader();
  const [tab, setTab] = useState("workflow");
  const [selectedAgentKey, setSelectedAgentKey] = useState<string | null>(null);
  const [showIdeaModal, setShowIdeaModal] = useState(false);

  const live = useProjectSocket(id);

  const { data: project, isLoading, error } = useGetProject(id, {
    query: {
      enabled: !!id,
      queryKey: getGetProjectQueryKey(id),
      refetchInterval: (query) => {
        if (live.connected) return false;
        const status = query.state.data?.status;
        return status && RUNNING_STATUSES.includes(status as (typeof RUNNING_STATUSES)[number])
          ? 3000
          : false;
      },
    },
  });

  const { data: dashboard } = useQuery({
    queryKey: getProjectDashboardQueryKey(id),
    queryFn: () => fetchProjectDashboard(id),
    enabled: !!id,
    refetchInterval: () => {
      if (live.connected) return false;
      return project && RUNNING_STATUSES.includes(project.status as (typeof RUNNING_STATUSES)[number])
        ? 3000
        : false;
    },
  });

  const { data: knowledge } = useListKnowledgeItems(id, {
    query: {
      enabled: !!id,
      queryKey: getListKnowledgeItemsQueryKey(id),
    },
  });

  const { data: document } = useGetDocument(id, {
    query: {
      enabled: !!id && Boolean(dashboard?.hasDocument),
      retry: false,
      queryKey: getGetDocumentQueryKey(id),
    },
  });

  const startProject = useStartProject();
  const cancelProject = useCancelProject();

  useEffect(() => {
    if (!project) {
      setWorkspaceHeader({});
      return;
    }
    setWorkspaceHeader({ projectName: project.name, projectStatus: project.status });
    return () => setWorkspaceHeader({});
  }, [project, setWorkspaceHeader]);

  useEffect(() => {
    if (!selectedAgentKey && dashboard?.currentAgentKey) {
      setSelectedAgentKey(dashboard.currentAgentKey);
    }
  }, [dashboard?.currentAgentKey, selectedAgentKey]);

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-[560px] w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="p-6">
        <div className="mt-16 text-center">
          <Activity className="mx-auto mb-4 h-12 w-12 text-destructive" />
          <h2 className="mb-2 text-2xl font-bold">Project Not Found</h2>
          <Button onClick={() => setLocation("/projects")} variant="outline" className="mt-4 rounded-xl">
            Back to Projects
          </Button>
        </div>
      </div>
    );
  }

  const isRunning = RUNNING_STATUSES.includes(
    project.status as (typeof RUNNING_STATUSES)[number],
  );
  const isCreated = project.status === "CREATED";
  const canRestart = ["CREATED", "FAILED", "WAITING_FOR_USER"].includes(project.status);

  const handleStart = () => {
    const resuming = !isCreated;
    startProject.mutate(
      { id },
      {
        onSuccess: () => {
          toast({
            title: resuming ? "Resuming Analysis" : "Analysis Started",
            description: resuming
              ? "Continuing from the failed / incomplete stage."
              : "Pipeline is running — watch the live agent panel.",
          });
          void queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
          void queryClient.invalidateQueries({ queryKey: getGetProjectProgressQueryKey(id) });
          void queryClient.invalidateQueries({ queryKey: getProjectDashboardQueryKey(id) });
        },
        onError: (err: unknown) => {
          const message = err instanceof Error ? err.message : "Unknown error";
          toast({ title: "Failed to start", description: message, variant: "destructive" });
        },
      },
    );
  };

  const handleCancel = () => {
    cancelProject.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Analysis Cancelled" });
          void queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
          void queryClient.invalidateQueries({ queryKey: getProjectDashboardQueryKey(id) });
        },
        onError: (err: unknown) => {
          const message = err instanceof Error ? err.message : "Unknown error";
          toast({ title: "Failed to cancel", description: message, variant: "destructive" });
        },
      },
    );
  };

  const handleDownload = () => {
    const md = document?.markdownContent;
    if (!md) {
      toast({ title: "Document not ready", variant: "destructive" });
      return;
    }
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, "-").toLowerCase()}-requirements.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeAgent = selectedAgentKey ?? dashboard?.currentAgentKey ?? null;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground md:text-2xl">{project.name}</h1>
          <p className="text-xs text-muted-foreground">
            {live.connected ? (
              <span className="inline-flex items-center gap-1.5 text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success/100" />
                Live updates connected
              </span>
            ) : (
              <span className="text-warning">Polling fallback (socket reconnecting…)</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canRestart && (
            <Button
              onClick={handleStart}
              disabled={startProject.isPending}
              className="gap-2 rounded-xl bg-primary hover:bg-primary-hover"
            >
              <Play className="h-4 w-4" /> {isCreated ? "Start Analysis" : "Resume Analysis"}
            </Button>
          )}
          {isRunning && (
            <Button
              onClick={handleCancel}
              disabled={cancelProject.isPending}
              variant="destructive"
              className="gap-2 rounded-xl"
            >
              <XOctagon className="h-4 w-4" /> Cancel
            </Button>
          )}
        </div>
      </div>

      <ProjectKpiBar dashboard={dashboard} />

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1">
          <TabsTrigger value="workflow" className="rounded-xl px-4">
            Workflow
          </TabsTrigger>
          <TabsTrigger value="executions" className="rounded-xl px-4">
            Execution Logs
          </TabsTrigger>
          <TabsTrigger value="requirements" className="rounded-xl px-4">
            Requirements
          </TabsTrigger>
          <TabsTrigger value="validation" className="rounded-xl px-4">
            Validation
          </TabsTrigger>
          <TabsTrigger value="questions" className="rounded-xl px-4">
            Questions
          </TabsTrigger>
          <TabsTrigger value="documents" className="rounded-xl px-4">
            Document
          </TabsTrigger>
          <TabsTrigger value="versions" className="rounded-xl px-4">
            Versions
          </TabsTrigger>
        </TabsList>

        <div className="mt-4">
          <TabsContent value="workflow" className="mt-0">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
              <div className="min-w-0 flex-1">
                <WorkflowPipeline
                  dashboard={dashboard}
                  selectedAgentKey={activeAgent}
                  onSelectAgent={(key) => {
                  if (key === null) {
                    setShowIdeaModal(true);
                  } else {
                    setSelectedAgentKey(key);
                  }
                }}
                />
              </div>
              <AgentLivePanel
                agentKey={activeAgent}
                dashboard={dashboard}
                activity={activeAgent ? live.activities[activeAgent] : undefined}
                knowledge={Array.isArray(knowledge) ? knowledge : undefined}
                liveConnected={live.connected}
              />
            </div>
          </TabsContent>

          <TabsContent value="executions">
            <TabExecutions projectId={id} />
          </TabsContent>
          <TabsContent value="documents">
            <TabDocument projectId={id} />
          </TabsContent>
          <TabsContent value="validation">
            <TabValidation projectId={id} />
          </TabsContent>
          <TabsContent value="questions">
            <TabQuestions projectId={id} />
          </TabsContent>
          <TabsContent value="requirements">
            <TabRequirements projectId={id} />
          </TabsContent>
          <TabsContent value="versions">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h3 className="text-lg font-bold">Document Versions</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Version history will appear here after recompiles. Current document updated:{" "}
                {document?.updatedAt
                  ? new Date(document.updatedAt).toLocaleString()
                  : "not generated yet"}
                .
              </p>
            </div>
          </TabsContent>
        </div>
      </Tabs>

      <DocumentSummaryFooter
        dashboard={dashboard}
        onPreview={() => setTab("documents")}
        onDownload={handleDownload}
      />

      {/* User Idea Modal */}
      <Dialog open={showIdeaModal} onOpenChange={setShowIdeaModal}>
        <DialogContent className="rounded-2xl sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-amber-500" />
              Project Idea / Input
            </DialogTitle>
            <DialogDescription>
              The original concept submitted for analysis
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <p className="text-sm leading-relaxed whitespace-pre-wrap font-mono bg-muted/40 p-5 rounded-xl border border-border/50">
              {project.idea}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
