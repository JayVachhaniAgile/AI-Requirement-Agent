import { useGetDocument, useGetProject, useListKnowledgeItems, useStartProject, useCancelProject, getListKnowledgeItemsQueryKey, getGetDocumentQueryKey } from "@workspace/api-client-react";
import { useLocation, useParams } from "wouter";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Play, XOctagon, Lightbulb, Target, ChevronRight, Clock, Zap, FileText, Users, BadgeCheck, Brain, Database, Monitor, TriangleAlert, FileWarning, Sparkles } from "lucide-react";

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
// import { ProjectKpiBar } from "@/components/projects/ProjectKpiBar";
import { WorkflowPipeline } from "@/components/projects/workflow/WorkflowPipeline";
import { AgentLivePanel } from "@/components/projects/AgentLivePanel";
import { DocumentSummaryFooter } from "@/components/projects/DocumentSummaryFooter";
import { TabExecutions } from "@/components/projects/TabExecutions";
import { TabDocument } from "@/components/projects/TabDocument";
import { TabValidation } from "@/components/projects/TabValidation";
import { TabQuestions } from "@/components/projects/TabQuestions";
import { TabRequirements } from "@/components/projects/TabRequirements";
import { RequirementSummaryDashboard, getNextSteps, InfoRow, DeliverableCard, NextStepCard } from "@/components/projects/RequirementSummaryDashboard";
import { ProjectIdeaRenderer } from "@/components/projects/ProjectIdeaRenderer"
import { VersionDiffViewer } from "@/components/projects/VersionDiffViewer";

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


function formatDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

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
          ? 1000
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
        ? 1000
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
            <RequirementSummaryDashboard projectId={id} dashboard={dashboard} knowledge={Array.isArray(knowledge) ? knowledge : undefined} />
            <div className="mt-6">
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

            {/* Key Deliverables + Next Steps */}
            <div className="grid grid-cols-1 xl:grid-cols-[70%_30%] gap-6 mt-6">
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Target className="w-5 h-5" style={{ color: "#06B6D4" }} /> Key Deliverables
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {(() => {
                    const ki = Array.isArray(knowledge) ? knowledge : [];
                    const funcReqs = ki.filter(i => i.type === 'FUNCTIONAL_REQUIREMENT').length;
                    const userStories = ki.filter(i => i.type === 'USER_STORY').length;
                    const accCriteria = ki.filter(i => i.type === 'ACCEPTANCE_CRITERIA').length;
                    const busRules = ki.filter(i => i.type === 'BUSINESS_RULE').length;
                    const dataEnts = ki.filter(i => i.type === 'DATA_ENTITY' || i.type === 'DB_TABLE').length;
                    const uiScreens = ki.filter(i => i.type === 'SCREEN' || i.type === 'UI_SCREEN').length;
                    return [
                      { key: "reqs", label: "Requirements", value: String(Math.max(funcReqs, dashboard?.requirementCount ?? 0)), sub: funcReqs > 0 ? `${funcReqs} generated` : "Total generated", icon: FileText, color: "#06B6D4" },
                      { key: "stories", label: "User Stories", value: String(userStories), sub: userStories > 0 ? `${userStories} ready` : "Not yet generated", icon: Users, color: "#3B82F6" },
                      { key: "criteria", label: "Acceptance Criteria", value: String(accCriteria), sub: accCriteria > 0 ? `${accCriteria} detailed` : "Pending", icon: BadgeCheck, color: "#22C55E" },
                      { key: "rules", label: "Business Rules", value: String(busRules), sub: busRules > 0 ? `${busRules} defined` : "None yet", icon: Brain, color: "#F59E0B" },
                      { key: "entities", label: "Data Entities", value: String(dataEnts), sub: dataEnts > 0 ? `${dataEnts} identified` : "Pending", icon: Database, color: "#A855F7" },
                      { key: "screens", label: "UI Screens", value: String(uiScreens), sub: uiScreens > 0 ? `${uiScreens} planned` : "Not started", icon: Monitor, color: "#EC4899" },
                    ];
                  })()
                    .map((item) => <DeliverableCard key={item.key} item={item} />)}
                </div>
                <div className="rounded-2xl border p-5" style={{ backgroundColor: "#111827", borderColor: "rgba(255,255,255,0.08)" }}>
                  <h3 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "#64748B" }}>Generation Details</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <InfoRow label="Execution Time" value={dashboard ? formatDuration(dashboard.etaSeconds ?? 0) : "—"} icon={Clock} accent="#06B6D4" />
                    <InfoRow label="Completed At" value={dashboard?.updatedAt ? formatDate(dashboard.updatedAt) : "—"} icon={CalendarIcon} accent="#3B82F6" />
                    <InfoRow label="Generated By" value="AI Requirements Engine" icon={Zap} accent="#10B981" />
                  </div>
                </div>
              </div>
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <ChevronRight className="w-5 h-5" style={{ color: "#10B981" }} /> Next Steps
                </h2>
                <div className="space-y-3">
                  {getNextSteps(dashboard).map((step) => {
                    let onClick;
                    if (step.id === 1 || step.id === 2) {
                      onClick = () => {
                        fetch(`/api/projects/${id}/start`, { method: 'POST' }).catch(console.error);
                      };
                    } else if (step.id === 3) {
                      onClick = () => setTab("requirements");
                    } else if (step.id === 4) {
                      onClick = () => setTab("validation");
                    } else if (step.id === 5) {
                      onClick = () => setTab("questions");
                    } else if (step.id === 6) {
                      onClick = () => setTab("validation");
                    } else if (step.id === 7) {
                      onClick = () => setTab("documents");
                    }
                    return <NextStepCard key={step.id} step={step} onClick={onClick} />;
                  })}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="executions">
            <TabExecutions projectId={id} />
          </TabsContent>
          <TabsContent value="documents">
            <TabDocument projectId={id} dashboard={dashboard} />
          </TabsContent>
          <TabsContent value="validation">
            <TabValidation projectId={id} />
          </TabsContent>
          <TabsContent value="questions">
            <TabQuestions projectId={id} />
          </TabsContent>
          <TabsContent value="requirements">
            <TabRequirements projectId={id} dashboard={dashboard} />
          </TabsContent>
          <TabsContent value="versions">
            <VersionDiffViewer projectId={id} />
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
            <ProjectIdeaRenderer idea={project.idea} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
