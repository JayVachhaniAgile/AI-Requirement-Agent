import { useState } from "react";
import { useListRequirements, getListRequirementsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { STATUS_COLORS } from "@/lib/constants";
import { FileText, Quote, Lightbulb, Brain, User, FileSearch, Edit3, Save, X, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SOURCE_ICONS: Record<string, typeof FileText> = {
  prompt: FileText,
  document: FileSearch,
  research: Brain,
  ai_analysis: Lightbulb,
  user_input: User,
  debate: AlertTriangle,
};

const SOURCE_LABELS: Record<string, string> = {
  prompt: "From User Prompt",
  document: "From Uploaded Doc",
  research: "From Research",
  ai_analysis: "AI Analysis",
  user_input: "User Input",
  debate: "Agent Debate",
};

const SOURCE_COLORS: Record<string, string> = {
  prompt: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  document: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  research: "bg-green-500/10 text-green-600 dark:text-green-400",
  ai_analysis: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  user_input: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  debate: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

function getSourceCategory(item: any): string {
  if (item.metadata) {
    try {
      const meta = typeof item.metadata === "string" ? JSON.parse(item.metadata) : item.metadata;
      return meta.sourceCategory || "ai_analysis";
    } catch {}
  }
  if (item.source?.includes("::")) return item.source.split("::")[1];
  return "ai_analysis";
}

function getEvidence(item: any): string | null {
  if (item.metadata) {
    try {
      const meta = typeof item.metadata === "string" ? JSON.parse(item.metadata) : item.metadata;
      return meta.evidence || null;
    } catch {}
  }
  return null;
}

function getConfidence(item: any): number | null {
  if (item.metadata) {
    try {
      const meta = typeof item.metadata === "string" ? JSON.parse(item.metadata) : item.metadata;
      return meta.confidence ?? null;
    } catch {}
  }
  return null;
}

export function TabRequirements({ projectId, dashboard }: { projectId: string; dashboard?: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: requirements, isLoading } = useListRequirements(projectId, {
    query: { enabled: !!projectId, queryKey: getListRequirementsQueryKey(projectId) },
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState<string | null>(null);
  const [expandedEvidence, setExpandedEvidence] = useState<string | null>(null);

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setEditTitle(item.title || "");
    setEditDesc(item.description || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle("");
    setEditDesc("");
  };

  const saveEdit = async (knowledgeId: string) => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/knowledge/${knowledgeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle, description: editDesc }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast({ title: "Updated", description: "Requirement saved." });
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: getListRequirementsQueryKey(projectId) });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerate = async (knowledgeId: string) => {
    setIsRegenerating(knowledgeId);
    try {
      const res = await fetch(`/api/projects/${projectId}/knowledge/${knowledgeId}/regenerate`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to start regeneration");
      const data = await res.json();
      toast({ title: "Regeneration Started", description: data.message });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsRegenerating(null);
    }
  };

  if (isLoading) {
    return <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}</div>;
  }

  if (!requirements || requirements.length === 0) {
    return (
      <div className="text-center p-12 border-2 border-dashed border-border text-muted-foreground text-sm font-semibold rounded-xl">
        No requirements generated yet. Start the analysis to see them appear here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {requirements.map((req) => {
        const sourceCat = getSourceCategory(req);
        const evidence = getEvidence(req);
        const confidence = getConfidence(req);
        const SourceIcon = SOURCE_ICONS[sourceCat] || FileText;
        const isEditing = editingId === req.id;

        return (
          <Card key={req.id} className="overflow-hidden">
            <CardHeader className="py-3 px-4 border-b bg-muted/20">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className="font-mono shrink-0 text-xs">
                    {req.externalId || req.id.substring(0, 8)}
                  </Badge>
                  {/* Source badge */}
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_COLORS[sourceCat] || "bg-muted text-muted-foreground"}`}>
                    <SourceIcon className="h-3 w-3" />
                    {SOURCE_LABELS[sourceCat] || sourceCat}
                  </span>

                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={isRegenerating === req.id ? "default" : STATUS_COLORS[req.status] || "default"}>{isRegenerating === req.id ? "Regenerating" : req.status}</Badge>
                  {!isEditing && (
                    <>
                      <button onClick={() => startEdit(req)} className="p-1 text-muted-foreground hover:text-foreground transition-colors" title="Edit">
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleRegenerate(req.id)} disabled={isRegenerating === req.id} className="p-1 text-muted-foreground hover:text-foreground transition-colors" title="Regenerate affected">
                        <RefreshCw className={`h-3.5 w-3.5 ${isRegenerating === req.id ? "animate-spin" : ""}`} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {isEditing ? (
                <div className="space-y-3">
                  <input
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-semibold"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Title"
                  />
                  <Textarea
                    className="min-h-[100px] font-mono text-sm"
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="Description"
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={isSaving}>
                      <X className="h-3 w-3 mr-1" /> Cancel
                    </Button>
                    <Button size="sm" onClick={() => saveEdit(req.id)} disabled={isSaving}>
                      <Save className="h-3 w-3 mr-1" /> {isSaving ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <h4 className="text-sm font-semibold">{req.title}</h4>
                  {req.description && (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap font-mono text-xs leading-relaxed">
                      {req.description}
                    </p>
                  )}
                  {/* Evidence section */}
                  {evidence && (
                    <div>
                      <button
                        onClick={() => setExpandedEvidence(expandedEvidence === req.id ? null : req.id)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Quote className="h-3 w-3" />
                        <span className="font-medium">Evidence</span>
                        <span className="text-muted-foreground/50">{expandedEvidence === req.id ? "▲" : "▼"}</span>
                      </button>
                      {expandedEvidence === req.id && (
                        <div className="mt-1 rounded-lg bg-muted/30 border border-border/50 p-3 text-xs font-mono text-muted-foreground leading-relaxed">
                          {evidence}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
