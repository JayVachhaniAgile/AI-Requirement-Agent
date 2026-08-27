import { useState, useEffect } from "react";
import { useGetDocument, getGetDocumentQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Download, FileText, RefreshCw, FileEdit, Users, Database, Code2, FolderDown, FileDown, Code } from "lucide-react";
import { MarkdownPreview } from "@/components/projects/MarkdownPreview";
import { useToast } from "@/hooks/use-toast";
import { recompileProjectDocument } from "@/lib/project-api";
import { cn } from "@/lib/utils";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from "@workspace/pipeline-config";
import type { LucideIcon } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";

const DOC_ICONS: Record<(typeof DOCUMENT_TYPES)[number], LucideIcon> = {
  COMPILED_DOCUMENT: FileText,
  FRD_DOCUMENT: FileEdit,
  USER_STORIES_DOCUMENT: Users,
  TECH_ARCH_DOCUMENT: Database,
  DB_DESIGN_DOCUMENT: Database,
  API_SPEC_DOCUMENT: Code2,
  SOW_DOCUMENT: FileText,
  BUILD_PROMPT_DOCUMENT: Code,
};

const DOC_COLORS: Record<(typeof DOCUMENT_TYPES)[number], string> = {
  COMPILED_DOCUMENT: "text-sky-400",
  FRD_DOCUMENT: "text-blue-400",
  USER_STORIES_DOCUMENT: "text-emerald-400",
  TECH_ARCH_DOCUMENT: "text-purple-400",
  DB_DESIGN_DOCUMENT: "text-pink-400",
  API_SPEC_DOCUMENT: "text-cyan-400",
  SOW_DOCUMENT: "text-amber-400",
  BUILD_PROMPT_DOCUMENT: "text-indigo-400",
};

const DOCUMENT_TYPE_OPTIONS = DOCUMENT_TYPES.map((type) => ({
  type,
  label: DOCUMENT_TYPE_LABELS[type],
  icon: DOC_ICONS[type],
  color: DOC_COLORS[type],
}));

function formatStatus(status: string | undefined): string {
  if (!status) return "\u2014";
  return status.replace(/_/g, " ");
}


export function TabDocument({ projectId, dashboard }: { projectId: string; dashboard?: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isRecompiling, setIsRecompiling] = useState(false);
  const [viewMode, setViewMode] = useState<"preview" | "source">("preview");
  // Read active document type from URL query param ?active=
  const searchParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const initialDocType = searchParams.get("active") || "COMPILED_DOCUMENT";
  const [selectedDocType, setSelectedDocType] = useState(initialDocType);

  // Update URL when selectedDocType changes (for refresh persistence)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("active", selectedDocType);
    window.history.replaceState(null, "", url.toString());
  }, [selectedDocType]);
  const [allDocs, setAllDocs] = useState<any[] | null>(null);
  const [doc, setDoc] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);


  const { data: compiledDoc, isLoading: compiledLoading } = useGetDocument(projectId, {
    query: { enabled: !!projectId, queryKey: getGetDocumentQueryKey(projectId) },
  });

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);
    apiFetch(`/api/projects/${projectId}/documents`)
      .then((r) => r.ok ? r.json() : [])
      .then((docs) => {
        if (cancelled) return;
        const normalized = docs.map((d: any) => ({ ...d, documentType: d.documentType ?? "COMPILED_DOCUMENT" }));
        setAllDocs(normalized);
        // Selection is handled by the [selectedDocType, allDocs] effect below,
        // so we don't close over a stale selectedDocType here.
        setLoading(false);
      })
      .catch(() => { if (!cancelled) { setAllDocs([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    if (compiledDoc) {
      const normalized = { ...compiledDoc, documentType: (compiledDoc as { documentType?: string }).documentType ?? "COMPILED_DOCUMENT" };
      const hasDoc = allDocs?.some((d) => d.documentType === "COMPILED_DOCUMENT");
      if (!hasDoc) setAllDocs((prev) => [...(prev ?? []), normalized]);
      if (selectedDocType === "COMPILED_DOCUMENT") setDoc(normalized);
    }
  }, [compiledDoc]);

  useEffect(() => {
    if (!allDocs) return;
    const found = allDocs.find((d) => d.documentType === selectedDocType || (selectedDocType === "COMPILED_DOCUMENT" && !d.documentType));
    if (found) setDoc(found); else setDoc(null);
  }, [selectedDocType, allDocs]);

  const currentDoc = doc || (selectedDocType === "COMPILED_DOCUMENT" ? compiledDoc : null);

  const handleCopy = () => {
    if (currentDoc?.markdownContent) { void navigator.clipboard.writeText(currentDoc.markdownContent); toast({ title: "Copied to clipboard" }); }
  };

  const handleDownload = () => {
    if (currentDoc?.markdownContent) {
      const blob = new Blob([currentDoc.markdownContent], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${currentDoc.documentType?.toLowerCase() ?? "document"}_${projectId}.md`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    }
  };

  const handleDownloadDocx = async () => {
    if (!currentDoc?.markdownContent) return;
    try {
      const { downloadMarkdownAsDocx } = await import("@/lib/markdown-to-docx");
      const docType = (currentDoc.documentType ?? "COMPILED_DOCUMENT").toLowerCase();
      await downloadMarkdownAsDocx(currentDoc.markdownContent, `${docType}_${projectId}.docx`);
      toast({ title: "Downloaded", description: "Word document exported successfully." });
    } catch (err) {
      toast({ title: "Download failed", description: err instanceof Error ? err.message : "Could not export Word document.", variant: "destructive" });
    }
  };

  const handleDownloadAll = async () => {
    try {
      const res = await apiFetch(`/api/projects/${projectId}/documents`);
      if (!res.ok) throw new Error("Failed to fetch documents");
      const docs: any[] = await res.json();
      if (!docs || docs.length === 0) {
        toast({ title: "No documents", description: "No documents found to download.", variant: "destructive" });
        return;
      }
      const zip = new (window as any).JSZip();
      docs.forEach((d: any) => {
        const docType = d.documentType ?? "COMPILED_DOCUMENT";
        const filename = `${docType.toLowerCase()}_${projectId}.md`;
        zip.file(filename, d.markdownContent ?? "");
      });
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `crystallize_${projectId}_all-docs.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Downloaded", description: `All ${docs.length} documents exported as a ZIP file.` });
    } catch (err) {
      toast({ title: "Download failed", description: err instanceof Error ? err.message : "Could not download documents.", variant: "destructive" });
    }
  };

  const handleRecompile = async () => {
    setIsRecompiling(true);
    try {
      await recompileProjectDocument(projectId);
      await queryClient.invalidateQueries({ queryKey: getGetDocumentQueryKey(projectId) });
      toast({ title: "Document regenerated", description: "Rebuilt from pipeline knowledge." });
      const res = await apiFetch(`/api/projects/${projectId}/documents`);
      if (res.ok) {
        const raw = await res.json();
        const docs = raw.map((d: any) => ({ ...d, documentType: d.documentType ?? "COMPILED_DOCUMENT" }));
        setAllDocs(docs);
        const found = docs.find((d: any) => d.documentType === selectedDocType);
        if (found) setDoc(found);
      }
    } catch (err) {
      toast({ title: "Regenerate failed", description: err instanceof Error ? err.message : "Recompile failed", variant: "destructive" });
    } finally { setIsRecompiling(false); }
  };

  const isLoading_state = compiledLoading;

  if (isLoading_state) {
    return (
      <div className="space-y-6">
        <div className="flex justify-end gap-2"><Skeleton className="h-10 w-24" /><Skeleton className="h-10 w-24" /></div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 bg-muted/30 p-3 rounded-xl border border-border">
        {DOCUMENT_TYPE_OPTIONS.map((dt) => {
          const Icon = dt.icon;
          const isActive = selectedDocType === dt.type;
          const isAvailable = allDocs?.some((d) => d.documentType === dt.type);
          return (
            <button key={dt.type} onClick={() => setSelectedDocType(dt.type)} disabled={!isAvailable} className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all", isActive ? "bg-card shadow-sm border border-border/80 text-foreground" : "text-muted-foreground/70 hover:text-foreground hover:bg-muted/50", !isAvailable && "opacity-40 cursor-not-allowed")}>
              <Icon className={cn("h-3.5 w-3.5", dt.color)} />
              {dt.label}
              {isAvailable && <span className="h-1.5 w-1.5 rounded-full bg-success/70" />}
            </button>
          );
        })}
      </div>

      <div className="flex justify-between items-center bg-muted/40 p-4 border border-border">
        <div className="flex items-center gap-3">
          <Badge variant={(isRecompiling || dashboard?.status === "COMPILING") ? "default" : currentDoc?.status === "FINAL" ? "success" : "warning"}>
            {isRecompiling ? "Compiling" : formatStatus(currentDoc?.status)}
          </Badge>
          <span className="text-xs text-muted-foreground">{DOCUMENT_TYPE_OPTIONS.find((d) => d.type === selectedDocType)?.label ?? "Document"}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-0.5">
            <button onClick={() => setViewMode("preview")} className={cn("rounded-md px-3 py-1 text-xs font-medium transition-colors", viewMode === "preview" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>Preview</button>
            <button onClick={() => setViewMode("source")} className={cn("rounded-md px-3 py-1 text-xs font-medium transition-colors", viewMode === "source" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>Source</button>
          </div>
          <Button variant="outline" size="sm" onClick={() => void handleRecompile()} disabled={isRecompiling} className="gap-2"><RefreshCw className={`h-4 w-4 ${isRecompiling ? "animate-spin" : ""}`} />{isRecompiling ? "Regenerating\u2026" : "Regenerate"}</Button>
          <Button variant="outline" size="sm" onClick={handleCopy} className="gap-2"><Copy className="h-4 w-4" /> Copy</Button>
          <Button variant="outline" size="sm" onClick={handleDownloadAll} className="gap-2"><FolderDown className="h-4 w-4" /> All Docs</Button>
          <Button variant="outline" size="sm" onClick={() => void handleDownloadDocx()} className="gap-2"><FileDown className="h-4 w-4" /> Word</Button>
          <Button variant="outline" size="sm" onClick={handleDownload} className="gap-2"><Download className="h-4 w-4" /> Markdown</Button>
        </div>
      </div>

      {currentDoc && currentDoc.markdownContent && (
        <Card className="rounded-none border-t-4 border-t-primary">
          <CardContent className="p-8 lg:p-12 max-w-none font-sans">
            {viewMode === "source" ? (
              <pre className="bg-transparent text-foreground font-sans text-[15px] leading-[1.6] whitespace-pre-wrap p-0 m-0 border-none outline-none resize-none w-full min-h-[200px]" spellCheck={false}>{currentDoc.markdownContent}</pre>
            ) : (
              <MarkdownPreview markdown={currentDoc.markdownContent} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
