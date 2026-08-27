import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Bot,
  Boxes,
  CheckCircle2,
  CircuitBoard,
  FileOutput,
  GitBranch,
  Play,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type CanonicalItem,
  compileContext,
  compileDocument,
  createOrchestrationPlan,
  dryRunDocument,
  evaluateProject,
  fetchCanonicalItems,
  fetchCanonicalKinds,
  fetchCompilerTypes,
  fetchMigrationComparisons,
  fetchMigrationStatus,
  fetchOrchestrationPlans,
  getCanonicalItemsQueryKey,
  getMigrationComparisonsQueryKey,
  getProjectEvaluationQueryKey,
  runOrchestrationPlan,
  type ContextPackage,
  type ProjectEvaluation,
} from "@/lib/foundation-api";

const QUALITY_STYLES: Record<string, string> = {
  PASS: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  WARNING: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  REVIEW_REQUIRED: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  BLOCKED: "bg-rose-500/15 text-rose-600 border-rose-500/30",
};

const ORCHESTRATION_OUTCOMES = [
  "full-requirements",
  "requirements",
  "architecture",
  "database",
  "security",
  "qa",
];

export function TabFoundation({ projectId }: { projectId: string }) {
  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1">
        <TabsTrigger value="overview" className="rounded-xl px-3">
          <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Migration
        </TabsTrigger>
        <TabsTrigger value="canonical" className="rounded-xl px-3">
          <Boxes className="mr-1.5 h-3.5 w-3.5" /> Canonical
        </TabsTrigger>
        <TabsTrigger value="context" className="rounded-xl px-3">
          <CircuitBoard className="mr-1.5 h-3.5 w-3.5" /> Context
        </TabsTrigger>
        <TabsTrigger value="quality" className="rounded-xl px-3">
          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Quality
        </TabsTrigger>
        <TabsTrigger value="compiler" className="rounded-xl px-3">
          <FileOutput className="mr-1.5 h-3.5 w-3.5" /> Compiler
        </TabsTrigger>
        <TabsTrigger value="orchestration" className="rounded-xl px-3">
          <GitBranch className="mr-1.5 h-3.5 w-3.5" /> Orchestration
        </TabsTrigger>
      </TabsList>

      <div className="mt-4 space-y-4">
        <TabsContent value="overview" className="mt-0">
          <MigrationTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="canonical" className="mt-0">
          <CanonicalTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="context" className="mt-0">
          <ContextTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="quality" className="mt-0">
          <QualityTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="compiler" className="mt-0">
          <CompilerTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="orchestration" className="mt-0">
          <OrchestrationTab projectId={projectId} />
        </TabsContent>
      </div>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------

function MigrationTab({ projectId }: { projectId: string }) {
  const statusQuery = useQuery({ queryKey: ["foundation", "migration", "status"], queryFn: fetchMigrationStatus });
  const comparisonsQuery = useQuery({
    queryKey: getMigrationComparisonsQueryKey(projectId),
    queryFn: () => fetchMigrationComparisons(projectId),
    enabled: !!projectId,
  });

  if (statusQuery.isLoading) return <Skeleton className="h-48 w-full" />;

  const agents = statusQuery.data?.agents ?? [];
  const comparisons = comparisonsQuery.data ?? [];
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-5 w-5 text-cyan-500" /> Skill Migration Modes
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-4">Agent</th>
                <th className="py-2 pr-4">Batch</th>
                <th className="py-2 pr-4">Mode</th>
                <th className="py-2">State</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.agentKey} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-medium">{a.agentKey}</td>
                  <td className="py-2 pr-4">{a.batch ?? "—"}</td>
                  <td className="py-2 pr-4">
                    <Badge variant="outline" className={a.enabled ? "border-cyan-500/40 text-cyan-600" : ""}>
                      {a.mode}
                    </Badge>
                  </td>
                  <td className="py-2">
                    <span className={a.enabled ? "text-emerald-600" : "text-muted-foreground"}>
                      {a.enabled ? "tracking active" : "legacy only"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Shadow Comparisons</CardTitle>
        </CardHeader>
        <CardContent>
          {comparisons.length === 0 ? (
            <p className="text-sm text-muted-foreground">No shadow comparisons recorded for this project yet.</p>
          ) : (
            <div className="space-y-2">
              {comparisons.slice(0, 10).map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-xl border p-3 text-sm">
                  <div>
                    <span className="font-medium">{c.agentKey}</span>
                    <span className="ml-2 text-muted-foreground">mode: {c.mode}</span>
                  </div>
                  <Badge variant="outline" className={c.verdict.canMigrate ? "border-emerald-500/40 text-emerald-600" : "border-rose-500/40 text-rose-600"}>
                    {c.verdict.canMigrate ? "migratable" : "blocked"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function CanonicalTab({ projectId }: { projectId: string }) {
  const kindsQuery = useQuery({ queryKey: ["foundation", "canonical", "kinds"], queryFn: fetchCanonicalKinds });
  const [kind, setKind] = useState<string>("");
  const itemsQuery = useQuery({
    queryKey: getCanonicalItemsQueryKey(projectId, kind),
    queryFn: () => fetchCanonicalItems(projectId, kind || undefined),
    enabled: !!projectId,
  });

  const grouped = useMemo(() => {
    const items = itemsQuery.data ?? [];
    const map = new Map<string, CanonicalItem[]>();
    for (const item of items) {
      const list = map.get(item.kind) ?? [];
      list.push(item);
      map.set(item.kind, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [itemsQuery.data]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Boxes className="h-5 w-5 text-violet-500" /> Canonical Project Model
            <Badge variant="outline" className="ml-auto">{itemsQuery.data?.length ?? 0} items</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="All kinds" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All kinds</SelectItem>
              {(kindsQuery.data?.kinds ?? []).map((k) => (
                <SelectItem key={k} value={k}>{k}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="mt-4 space-y-4">
            {itemsQuery.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : grouped.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No canonical items yet. Structured artifacts appear here once skills or the canonical API persist them.
              </p>
            ) : (
              grouped.map(([groupKind, items]) => (
                <div key={groupKind}>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {groupKind} <span className="ml-1 text-xs">({items.length})</span>
                  </h3>
                  <div className="space-y-2">
                    {items.map((item) => (
                      <div key={item.id} className="rounded-xl border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-mono text-xs text-muted-foreground">{item.externalId}</span>
                            <span className="ml-2 font-medium">{item.title}</span>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">v{item.version}</Badge>
                            {item.confidence != null && (
                              <Badge variant="outline" className="text-[10px]">{item.confidence}%</Badge>
                            )}
                            <Badge variant="outline" className="text-[10px]">{item.status}</Badge>
                          </div>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>class: {item.provenance.epistemicClass ?? "?"}</span>
                          <span>sources: {(item.provenance.sources ?? []).map((s) => s.category).join(", ") || "none"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ContextTab({ projectId }: { projectId: string }) {
  const [taskType, setTaskType] = useState("requirements");
  const [result, setResult] = useState<ContextPackage | null>(null);
  const compileMutation = useMutation({
    mutationFn: () => compileContext(projectId, { agentSkill: taskType, taskType, maxTokens: 12000 }),
    onSuccess: setResult,
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CircuitBoard className="h-5 w-5 text-cyan-500" /> Context Engine
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={taskType} onValueChange={setTaskType}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["requirements", "ux", "database", "security", "architecture", "estimation", "testing", "document", "validation", "gap_analysis"].map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => compileMutation.mutate()} disabled={compileMutation.isPending}>
            {compileMutation.isPending ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
            Compile Context
          </Button>
        </div>

        {compileMutation.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : result ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">~{result.tokenEstimate} tokens</Badge>
              <Badge variant="outline">{result.relevantArtifacts.length} artifacts</Badge>
              <Badge variant="outline">{result.relevantEvidence.length} evidence</Badge>
              <Badge variant="outline">{result.dependencies.length} dependencies</Badge>
              {result.cached && <Badge className="border-cyan-500/40 bg-cyan-500/15 text-cyan-600">cached</Badge>}
            </div>
            <p className="whitespace-pre-wrap rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
              {result.projectSummary}
            </p>
            {result.warnings.length > 0 && (
              <div className="space-y-1">
                {result.warnings.map((w, i) => (
                  <p key={i} className="flex items-center gap-1.5 text-xs text-amber-600">
                    <TriangleAlert className="h-3.5 w-3.5" /> {w}
                  </p>
                ))}
              </div>
            )}
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {result.relevantArtifacts.map((a, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl border p-2.5 text-sm">
                  <div className="min-w-0">
                    <span className="font-mono text-xs text-muted-foreground">{a.source.externalId}</span>
                    <span className="ml-2 truncate font-medium">{a.title}</span>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">rel {(a.score ?? 0).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Compile a task-specific context package — the engine picks the smallest useful subset of the project knowledge.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function QualityTab({ projectId }: { projectId: string }) {
  const qualityQuery = useQuery({
    queryKey: getProjectEvaluationQueryKey(projectId),
    queryFn: () => evaluateProject(projectId),
    enabled: false,
  });
  const runMutation = useMutation({
    mutationFn: () => evaluateProject(projectId),
    onSuccess: () => qualityQuery.refetch(),
  });

  const evaluation: ProjectEvaluation | undefined = runMutation.data ?? qualityQuery.data;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" /> Quality Gate Engine
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button size="sm" onClick={() => runMutation.mutate()} disabled={runMutation.isPending}>
          {runMutation.isPending ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
          Evaluate Project
        </Button>

        {runMutation.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : evaluation ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Avg Score", `${evaluation.summary.averageScore}`],
                ["Total", `${evaluation.summary.total}`],
                ["Passed", `${evaluation.summary.passed}`],
                ["Warnings", `${evaluation.summary.warnings}`],
                ["Review", `${evaluation.summary.reviewRequired}`],
                ["Blocked", `${evaluation.summary.blocked}`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border bg-card p-3 text-center">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-lg font-bold">{value}</p>
                </div>
              ))}
            </div>
            <div className="max-h-96 space-y-2 overflow-y-auto">
              {evaluation.results.map(({ artifact, result }) => (
                <div key={artifact.id} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-mono text-xs text-muted-foreground">{artifact.id}</span>
                      <span className="ml-2 text-sm font-medium">{artifact.title}</span>
                      <Badge variant="outline" className="ml-2 text-[10px]">{artifact.kind}</Badge>
                    </div>
                    <Badge variant="outline" className={QUALITY_STYLES[result.status] ?? ""}>
                      {result.status} · {result.score}
                    </Badge>
                  </div>
                  {result.blockingIssues.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {result.blockingIssues.map((b, i) => (
                        <p key={i} className="flex items-center gap-1.5 text-xs text-rose-600">
                          <XCircle className="h-3.5 w-3.5" /> {b}
                        </p>
                      ))}
                    </div>
                  )}
                  {result.recommendations.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">Tip: {result.recommendations[0]}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Evaluate the project&apos;s canonical artifacts against the centralized quality gates (schema, completeness,
            consistency, traceability, dependency integrity, conflicts…).
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function CompilerTab({ projectId }: { projectId: string }) {
  const typesQuery = useQuery({ queryKey: ["foundation", "compiler", "types"], queryFn: fetchCompilerTypes });
  const [docType, setDocType] = useState("FRD");
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof dryRunDocument>> | null>(null);
  const [saved, setSaved] = useState(false);

  const previewMutation = useMutation({
    mutationFn: () => dryRunDocument(projectId, docType),
    onSuccess: (data) => {
      setPreview(data);
      setSaved(false);
    },
  });
  const compileMutation = useMutation({
    mutationFn: () => compileDocument(projectId, docType),
    onSuccess: () => setSaved(true),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileOutput className="h-5 w-5 text-blue-500" /> Artifact Compiler
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger className="w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(typesQuery.data?.documentTypes ?? []).map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${previewMutation.isPending ? "animate-spin" : ""}`} />
            Preview
          </Button>
          <Button size="sm" onClick={() => compileMutation.mutate()} disabled={compileMutation.isPending || !preview}>
            <FileOutput className="mr-1.5 h-3.5 w-3.5" /> Compile & Save
          </Button>
          {saved && <Badge className="border-emerald-500/40 bg-emerald-500/15 text-emerald-600">document saved</Badge>}
        </div>

        {preview ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{preview.sourceArtifactCount} source artifacts</Badge>
              <Badge variant="outline">compiler v{preview.compilerVersion}</Badge>
              <Badge variant="outline">template v{preview.templateVersion}</Badge>
            </div>
            {preview.warnings.length > 0 && (
              <div className="space-y-1">
                {preview.warnings.slice(0, 8).map((w, i) => (
                  <p key={i} className="flex items-center gap-1.5 text-xs text-amber-600">
                    <TriangleAlert className="h-3.5 w-3.5" /> {w.message}
                  </p>
                ))}
              </div>
            )}
            <pre className="max-h-[480px] overflow-auto rounded-xl bg-muted/40 p-3 text-xs leading-relaxed">
              {preview.markdown}
            </pre>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Compile the canonical project model into a project document (FRD, User Stories, Architecture, DB, API, QA, SOW,
            Build Prompt). Deterministic — canonical facts come from the model, not the LLM.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function OrchestrationTab({ projectId }: { projectId: string }) {
  const [outcome, setOutcome] = useState("full-requirements");
  const plansQuery = useQuery({
    queryKey: ["foundation", "orchestration", projectId],
    queryFn: () => fetchOrchestrationPlans(projectId),
    enabled: !!projectId,
  });
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [planResult, setPlanResult] = useState<Record<string, unknown> | null>(null);

  const createMutation = useMutation({
    mutationFn: () => createOrchestrationPlan(projectId, outcome),
    onSuccess: () => plansQuery.refetch(),
  });
  const runMutation = useMutation({
    mutationFn: async (planId: string) => {
      const result = await runOrchestrationPlan(planId);
      setPlanResult(result);
      await plansQuery.refetch();
      return result;
    },
  });

  const plans = plansQuery.data ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <GitBranch className="h-5 w-5 text-cyan-500" /> Orchestration Engine 2.0
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={outcome} onValueChange={setOutcome}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ORCHESTRATION_OUTCOMES.map((o) => (
                <SelectItem key={o} value={o}>{o}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            Create Plan
          </Button>
        </div>

        {plans.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                <SelectTrigger className="w-[320px]">
                  <SelectValue placeholder="Select a plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.requestedOutcome} · {p.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={() => selectedPlanId && runMutation.mutate(selectedPlanId)} disabled={!selectedPlanId || runMutation.isPending}>
                <Play className="mr-1.5 h-3.5 w-3.5" /> Run
              </Button>
            </div>

            {planResult && (
              <pre className="overflow-auto rounded-xl bg-muted/40 p-3 text-xs">
                {JSON.stringify(planResult, null, 2)}
              </pre>
            )}

            <div className="space-y-2">
              {plans.slice(0, 5).map((p) => (
                <div key={p.id} className="rounded-xl border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{p.requestedOutcome}</span>
                    <Badge variant="outline">{p.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {p.plan.levels.length} levels · skipped: {p.plan.skipped.length} · checkpoints: {Object.keys(p.plan.checkpoints).length}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1">
                    {p.plan.levels.map((level, i) => (
                      <span key={i} className="rounded bg-muted/50 px-1.5 py-0.5 text-[10px]">{level.join(", ")}</span>
                    ))}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
