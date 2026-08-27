import { useGetDocument, useGetProject, useListKnowledgeItems, useStartProject, useCancelProject, getListKnowledgeItemsQueryKey, getGetDocumentQueryKey } from "@workspace/api-client-react";
import { useLocation, useParams } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Play, XOctagon, Lightbulb, Target, ChevronRight, Clock, Zap, FileText, Users, BadgeCheck, Brain, Database, Monitor, Sparkles, Pause, RotateCcw, ThumbsUp } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { useDagSocket } from "@/hooks/use-dag-socket";
import {
  fetchDagState,
  getDagStateQueryKey,
  startDagProject,
  resumeDagProject,
  pauseDagProject,
  approveDagNode,
  type DagRunState,
} from "@/lib/dag-api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { getGetProjectQueryKey, getGetProjectProgressQueryKey } from "@workspace/api-client-react";
import {
  fetchProjectDashboard,
  getProjectDashboardQueryKey,
} from "@/lib/project-api";
import { useProjectSocket } from "@/hooks/use-project-socket";
import { useWorkspaceHeader } from "@/components/layouts/workspace-header-context";
import { TreePipelineView } from "@/components/projects/TreePipelineView";
import { AgentLivePanel } from "@/components/projects/AgentLivePanel";
import { AgentDetailsModal } from "@/components/projects/AgentDetailsModal";
import { DocumentSummaryFooter } from "@/components/projects/DocumentSummaryFooter";
import { TabExecutions } from "@/components/projects/TabExecutions";
import { TabFoundation } from "@/components/projects/TabFoundation";
import { fetchCanonicalItems } from "@/lib/foundation-api";
import { TabDocument } from "@/components/projects/TabDocument";
import { DiscoveryCheckpointCard } from "@/components/projects/DiscoveryCheckpointCard";
import { GapAnalysisTab } from "@/components/projects/GapAnalysisTab";
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
  "GAP_ANALYSIS_REVIEW",
] as const;


function formatDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  // return m > 0 ? `${m}m ${s}s` : `${m}m`;
  return m > 0 ? `${m}m` : `${s}s`;

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
    const canonicalQuery = useQuery({
    queryKey: ["foundation", "canonical", "workspace", id],
    queryFn: () => fetchCanonicalItems(id),
    enabled: !!id,
  });
  const canonicalCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of canonicalQuery.data ?? []) {
      const producer = item.provenance?.producedBy ?? "";
      counts[producer] = (counts[producer] ?? 0) + 1;
    }
    return counts;
  }, [canonicalQuery.data]);

  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("tab") || "workflow";
    }
    return "workflow";
  });
  const [selectedAgentKey, setSelectedAgentKey] = useState<string | null>(null);
  const [showIdeaModal, setShowIdeaModal] = useState(false);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [agentModalKey, setAgentModalKey] = useState<string | null>(null);
  const [isPausing, setIsPausing] = useState(false);

  // Sync activeTab to URL query param ?tab=
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", activeTab);
    window.history.replaceState(null, "", url.toString());
  }, [activeTab]);

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
      refetchInterval: () => {
        if (live.connected) return false;
        return project && RUNNING_STATUSES.includes(project.status as (typeof RUNNING_STATUSES)[number])
          ? 2000
          : false;
      },
    },
  });

  // DAG workflow state
  const dagSocket = useDagSocket(id);

  const dagStateQuery = useQuery({
    queryKey: getDagStateQueryKey(id),
    queryFn: () => fetchDagState(id),
    enabled: !!id,
    retry: false,
    refetchInterval: () => {
      if (live.connected) return false;
      return project && RUNNING_STATUSES.includes(project.status as (typeof RUNNING_STATUSES)[number])
        ? 2000
        : false;
    },
  });

  const dagRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: getDagStateQueryKey(id) });
    void queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
    void queryClient.invalidateQueries({ queryKey: getProjectDashboardQueryKey(id) });
  };

  const runMutation = useMutation({
    mutationFn: (
      op:
        | { kind: "start" }
        | { kind: "run"; fn: () => Promise<DagRunState> },
    ) =>
      op.kind === "start"
        ? startDagProject(id)
        : op.fn(),
    onSuccess: (state: DagRunState) => {
      queryClient.setQueryData(getDagStateQueryKey(id), state);
      toast({ title: "DAG Run", description: "Run " + (state.run?.status?.toLowerCase() ?? "unknown") });
      dagRefresh();
    },
    onError: (err: Error) => {
      toast({ title: "DAG Run Failed", description: err.message, variant: "destructive" });
    },
  });

  const nodeAction = (
    action: (runId: string) => Promise<DagRunState>,
    runId: string,
    label: string,
  ) =>
    runMutation.mutate(
      { kind: "run", fn: () => action(runId) },
      {
        onSuccess: () =>
          toast({ title: label, description: "DAG run updated" }),
      },
    );

  const dagRun = dagStateQuery.data?.run;
  const dagStatus = dagRun?.status ?? null;
  const dagRunning = dagStatus === "RUNNING" || dagStatus === "PENDING";
  const dagResumable = dagStatus === "PAUSED" || dagStatus === "FAILED";
  const dagAwaitingDiscovery =
    dagStatus === "WAITING_APPROVAL" && dagRun?.currentNodeKey === "discovery";
  const dagDone = dagStatus === "COMPLETED" || dagStatus === "CANCELLED";

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

  const projectStatus = project.status as string;
  const isRunning = RUNNING_STATUSES.includes(
    projectStatus as (typeof RUNNING_STATUSES)[number],
  );
  const isCreated = projectStatus === "CREATED";
  const canRestart = [
    "CREATED",
    "FAILED",
    "WAITING_FOR_USER",
    "PAUSED",
    "COMPLETED",
    "GAP_ANALYSIS_REVIEW",
  ].includes(projectStatus);
  const isPaused = projectStatus === "PAUSED";
  const showDiscoveryCard =
    projectStatus === "WAITING_FOR_USER" || dagAwaitingDiscovery;

  const handleStart = () => {
    // Prefer project-scoped start (cancel + artifact reset + DISCOVERING).
    // Falls back through the same lifecycle as POST /api/projects/:id/start.
    startProject.mutate(
      { id },
      {
        onSuccess: () => {
          toast({
            title: "Analysis Started",
            description: "Pipeline is running — watch the live agent panel and workflow.",
          });
          void queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
          void queryClient.invalidateQueries({ queryKey: getGetProjectProgressQueryKey(id) });
          void queryClient.invalidateQueries({ queryKey: getProjectDashboardQueryKey(id) });
          void queryClient.invalidateQueries({ queryKey: getDagStateQueryKey(id) });
        },
        onError: (err: unknown) => {
          const message = err instanceof Error ? err.message : "Unknown error";
          toast({ title: "Failed to start", description: message, variant: "destructive" });
        },
      },
    );
  };

  const handlePause = () => {
    setIsPausing(true);
    pauseDagProject(id)
      .then(() => {
        toast({ title: "Analysis Paused" });
        dagRefresh();
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Unknown error";
        toast({ title: "Failed to pause", description: message, variant: "destructive" });
      })
      .finally(() => setIsPausing(false));
  };

  const handleCancel = () => {
    cancelProject.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Analysis Cancelled" });
          void queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
          void queryClient.invalidateQueries({ queryKey: getProjectDashboardQueryKey(id) });
          void queryClient.invalidateQueries({ queryKey: getDagStateQueryKey(id) });
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
        <div className="flex flex-wrap items-center gap-2">
          {canRestart && !dagRunning && projectStatus !== "WAITING_FOR_USER" && (
            <Button
              onClick={handleStart}
              disabled={startProject.isPending || runMutation.isPending}
              className="gap-2 rounded-xl bg-primary hover:bg-primary-hover"
            >
              <Play className="h-4 w-4" />
              {isCreated
                ? "Start Analysis"
                : projectStatus === "COMPLETED" || projectStatus === "GAP_ANALYSIS_REVIEW"
                  ? "Restart Analysis"
                  : isPaused
                    ? "Resume Analysis"
                    : "Resume Analysis"}
            </Button>
          )}
          {dagRunning && (
            <Button
              onClick={handlePause}
              disabled={isPausing}
              variant="outline"
              className="gap-2 rounded-xl"
            >
              <Pause className="h-4 w-4" />
              Pause
            </Button>
          )}
          {dagResumable && (
            <Button
              className="gap-2 rounded-xl bg-primary hover:bg-primary-hover"
              onClick={() =>
                runMutation.mutate({
                  kind: "run",
                  fn: () => resumeDagProject(id),
                })
              }
              disabled={runMutation.isPending}
            >
              <Play className="h-4 w-4" /> Resume Run
            </Button>
          )}
          {dagAwaitingDiscovery && (
            <Button
              className="gap-2 rounded-xl bg-primary hover:bg-primary-hover"
              onClick={() =>
                dagRun &&
                dagRun.currentNodeKey &&
                nodeAction(
                  () => approveDagNode(dagRun.id, dagRun.currentNodeKey ?? ""),
                  dagRun.id,
                  "Approved",
                )
              }
              disabled={runMutation.isPending || !dagRun?.currentNodeKey}
            >
              <ThumbsUp className="h-4 w-4" /> Approve Discovery
            </Button>
          )}
          {dagDone && (
            <Button
              className="gap-2 rounded-xl bg-primary hover:bg-primary-hover"
              onClick={handleStart}
              disabled={startProject.isPending}
            >
              <RotateCcw className="h-4 w-4" /> New Run
            </Button>
          )}
          {(dagRunning || isRunning || dagResumable || projectStatus === "WAITING_FOR_USER") && (
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

      {showDiscoveryCard && <DiscoveryCheckpointCard projectId={id} />}

      {String(project.status) === "GAP_ANALYSIS_REVIEW" && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <GapAnalysisTab projectId={id} />
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
          <TabsTrigger value="foundation" className="rounded-xl px-4">
            <Sparkles className="mr-1.5 h-4 w-4 text-fuchsia-500" /> Foundation
          </TabsTrigger>
          <TabsTrigger value="gap-analysis" className="rounded-xl px-4">
            Gap Analysis
          </TabsTrigger>

        </TabsList>

        <div className="mt-4">
          <TabsContent value="workflow" className="mt-0">
            <RequirementSummaryDashboard projectId={id} dashboard={dashboard} knowledge={Array.isArray(knowledge) ? knowledge : undefined} />

            <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
              <TreePipelineView
                projectName={project?.idea?.slice(0, 50)}
                projectId={id}
                steps={dashboard?.steps ?? []}
                projectStatus={project?.status ?? "IDLE"}
                canonicalCounts={canonicalCounts}
                onAgentClick={(agentKey) => {
                  setAgentModalKey(agentKey);
                  setShowAgentModal(true);
                  setSelectedAgentKey(agentKey);
                }}
              />
              <AgentLivePanel
                agentKey={selectedAgentKey}
                dashboard={dashboard}
                activity={
                  selectedAgentKey
                    ? live.activities[selectedAgentKey]
                    : dashboard?.currentAgentKey
                      ? live.activities[dashboard.currentAgentKey]
                      : undefined
                }
                knowledge={knowledge}
                liveConnected={live.connected}
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
                    <InfoRow label="Execution Time" value={dashboard ? formatDuration((dashboard.steps ?? []).reduce((sum, s) => sum + (s.durationMs ?? 0), 0) / 1000) : "—"} icon={Clock} accent="#06B6D4" />
                    <InfoRow label="Completed At" value={dashboard?.updatedAt ? formatDate(dashboard.updatedAt) : "—"} icon={CalendarIcon} accent="#3B82F6" />
                    <InfoRow label="Generated By" value="Crystallize" icon={Zap} accent="#10B981" />
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
                        apiFetch(`/api/projects/${id}/start`, { method: 'POST' }).catch(console.error);
                      };
                    } else if (step.id === 3) {
                      onClick = () => setActiveTab("requirements");
                    } else if (step.id === 4) {
                      onClick = () => setActiveTab("validation");
                    } else if (step.id === 5) {
                      onClick = () => setActiveTab("questions");
                    } else if (step.id === 6) {
                      onClick = () => setActiveTab("validation");
                    } else if (step.id === 7) {
                      onClick = () => setActiveTab("documents");
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

          <TabsContent value="foundation" className="mt-0">
            <TabFoundation projectId={id} />
          </TabsContent>

          <TabsContent value="gap-analysis" className="mt-0">
            <GapAnalysisTab projectId={id} />
          </TabsContent>

        </div>
      </Tabs>

      <DocumentSummaryFooter
        dashboard={dashboard}
        onPreview={() => setActiveTab("documents")}
        onDownload={handleDownload}
      />

      {/* Agent Details Modal */}
      <AgentDetailsModal
        projectId={id}
        agentKey={agentModalKey}
        open={showAgentModal}
        onOpenChange={(open) => {
          setShowAgentModal(open);
          if (!open) setAgentModalKey(null);
        }}
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
