import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useListProjects } from "@workspace/api-client-react";
import { Boxes, Clock, ExternalLink, FileCode2, FileText, FolderKanban, Globe, MoreVertical, PlusCircle, RefreshCw, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import {
  fetchArtifacts,
  generateArtifact,
  getArtifactsQueryKey,
  openArtifact,
  openArtifactWebsite,
  regenerateArtifact,
  type ArtifactSummary,
} from "@/lib/artifacts-api";

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/40 text-primary">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold text-foreground leading-tight">{value}</p>
        </div>
      </div>
    </div>
  );
}

export default function ArtifactsPage() {
  const queryClient = useQueryClient();
  const { data: artifacts, isLoading, refetch, isRefetching } = useQuery<ArtifactSummary[]>({
    queryKey: getArtifactsQueryKey(),
    queryFn: fetchArtifacts,
  });
  const { data: allProjects } = useListProjects();
  const [confirmTarget, setConfirmTarget] = useState<ArtifactSummary | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const projects = new Set(artifacts?.map((a) => a.projectId) ?? []).size;

  const projectList = Array.isArray(allProjects) ? allProjects : [];
  const selectedProject = projectList.find((p) => p.id === selectedProjectId);

  const handleGenerate = async () => {
    if (!selectedProjectId) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      await generateArtifact(selectedProjectId);
      setSelectedProjectId("");
      await queryClient.invalidateQueries({ queryKey: getArtifactsQueryKey() });
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerate = async (artifact: ArtifactSummary) => {
    setRegeneratingId(artifact.id);
    setRegenerateError(null);
    try {
      await regenerateArtifact(artifact.id);
      setConfirmTarget(null);
      // Regeneration is synchronous for the artifact document; refresh the
      // list immediately to show the new updatedAt/title.
      await queryClient.invalidateQueries({ queryKey: getArtifactsQueryKey() });
    } catch (err) {
      setRegenerateError(err instanceof Error ? err.message : "Regeneration failed");
    } finally {
      setRegeneratingId(null);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Artifacts</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Standalone HTML artifacts generated from each project&apos;s development build prompt.
            Click <span className="font-medium">Open</span> to view an artifact in a new tab.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isRefetching} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Generate an artifact for any project (including projects completed
          before the artifacts feature existed) */}
      <Card className="rounded-2xl border-border shadow-sm">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[240px] flex-1 space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground/70">Generate artifact for project</p>
            <Select value={selectedProjectId} onValueChange={(v) => { setSelectedProjectId(v); setGenerateError(null); }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a project…" />
              </SelectTrigger>
              <SelectContent>
                {projectList.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => void handleGenerate()}
            disabled={!selectedProjectId || generating}
            className="gap-2"
          >
            <PlusCircle className={`h-4 w-4 ${generating ? "animate-spin" : ""}`} />
            {generating ? "Generating…" : "Generate"}
          </Button>
          {generateError && <p className="w-full text-sm text-destructive">{generateError}</p>}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Artifacts" value={artifacts?.length ?? 0} icon={<Boxes className="h-4 w-4" />} />
            <StatCard label="Projects" value={projects} icon={<FolderKanban className="h-4 w-4" />} />
            <StatCard label="Type" value="Build Prompt" icon={<FileCode2 className="h-4 w-4" />} />
            <StatCard label="Format" value="HTML" icon={<FileText className="h-4 w-4" />} />
          </div>

          {artifacts && artifacts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {artifacts.map((artifact) => (
                <Card key={artifact.id} className="rounded-2xl border-border shadow-sm transition-shadow hover:shadow-md">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm font-semibold text-foreground leading-snug">
                        {artifact.title}
                      </CardTitle>
                      <Badge variant="outline" className="shrink-0 gap-1">
                        <FileCode2 className="h-3 w-3" />
                        HTML
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="truncate text-xs text-muted-foreground">{artifact.projectName}</p>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      Updated {format(new Date(artifact.updatedAt), "MMM d, yyyy h:mm a")}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button size="sm" className="gap-1.5" onClick={() => openArtifact(artifact)}>
                        <FileText className="h-3.5 w-3.5" />
                        Prompt
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openArtifactWebsite(artifact)}>
                        <Globe className="h-3.5 w-3.5" />
                        Website
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={regeneratingId === artifact.id}
                        onClick={() => setConfirmTarget(artifact)}
                      >
                        <RotateCcw className={`h-3.5 w-3.5 ${regeneratingId === artifact.id ? "animate-spin" : ""}`} />
                        {regeneratingId === artifact.id ? "Regenerating…" : "Regenerate"}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setConfirmTarget(artifact)}>
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Regenerate for {artifact.projectName}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-12 text-center">
              <Boxes className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm font-semibold text-foreground">No artifacts yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                No artifacts yet. Use the <span className="font-medium">Generate artifact for project</span>{" "}
                control above to create one from an existing project&apos;s build prompt.
              </p>
            </div>
          )}
        </>
      )}

      <Dialog open={confirmTarget !== null} onOpenChange={(open) => { if (!open) setConfirmTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate artifact?</DialogTitle>
            <DialogDescription>
              This will re-run the Development Build Prompt stage for{" "}
              <span className="font-semibold text-foreground">{confirmTarget?.projectName}</span>{" "}
              and replace this artifact with the freshly generated prompt. Other documents and
              knowledge are preserved.
            </DialogDescription>
          </DialogHeader>
          {regenerateError && (
            <p className="text-sm text-destructive">{regenerateError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmTarget(null); setRegenerateError(null); }}>
              Cancel
            </Button>
            <Button
              disabled={regeneratingId !== null}
              onClick={() => { if (confirmTarget) void handleRegenerate(confirmTarget); }}
              className="gap-2"
            >
              <RotateCcw className={`h-4 w-4 ${regeneratingId === confirmTarget?.id ? "animate-spin" : ""}`} />
              {regeneratingId === confirmTarget?.id ? "Regenerating…" : "Regenerate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
