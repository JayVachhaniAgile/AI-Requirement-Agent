import { useState, useEffect } from "react";
import { useGetDocument, getGetDocumentQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Download, FileText, RefreshCw, FileEdit, Users, Database, Code2, FolderDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { recompileProjectDocument } from "@/lib/project-api";
import { cn } from "@/lib/utils";

const DOCUMENT_TYPES = [
  { type: "COMPILED_DOCUMENT", label: "Compiled Document", icon: FileText, color: "text-sky-400" },
  { type: "FRD_DOCUMENT", label: "Functional Requirements", icon: FileEdit, color: "text-blue-400" },
  { type: "USER_STORIES_DOCUMENT", label: "User Stories & Acceptance", icon: Users, color: "text-emerald-400" },
  { type: "TECH_ARCH_DOCUMENT", label: "Technical Architecture", icon: Database, color: "text-purple-400" },
  { type: "DB_DESIGN_DOCUMENT", label: "Database Design", icon: Database, color: "text-pink-400" },
  { type: "API_SPEC_DOCUMENT", label: "API Specification", icon: Code2, color: "text-cyan-400" },
];

function formatStatus(status: string | undefined): string {
  if (!status) return "\u2014";
  return status.replace(/_/g, " ");
}


export function TabDocument({ projectId, dashboard }: { projectId: string; dashboard?: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isRecompiling, setIsRecompiling] = useState(false);
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
    setLoading(true);
    fetch(`/api/projects/${projectId}/documents`)
      .then((r) => r.ok ? r.json() : [])
      .then((docs) => {
        const normalized = docs.map((d: any) => ({ ...d, documentType: d.documentType ?? "COMPILED_DOCUMENT" }));
        setAllDocs(normalized);
        if (normalized.length > 0) {
          const found = normalized.find((d: any) => d.documentType === selectedDocType);
          if (found) setDoc(found);
        }
        setLoading(false);
      })
      .catch(() => { setAllDocs([]); setLoading(false); });
  }, [projectId]);

  useEffect(() => {
    if (compiledDoc) {
      const normalized = { ...compiledDoc, documentType: compiledDoc.documentType ?? "COMPILED_DOCUMENT" };
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

  const handleDownloadAll = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/documents`);
      if (!res.ok) throw new Error("Failed to fetch documents");
      const docs: any[] = await res.json();
      if (!docs || docs.length === 0) {
        toast({ title: "No documents", description: "No documents found to download.", variant: "destructive" });
        return;
      }
      const zip = new JSZip();
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
      const res = await fetch(`/api/projects/${projectId}/documents`);
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

  if (!currentDoc || !currentDoc.markdownContent) {
    return (
      <div className="text-center p-12 border-2 border-dashed border-border flex flex-col items-center justify-center gap-4">
        <FileText className="h-12 w-12 text-muted-foreground/50" />
        <h3 className="text-lg font-bold uppercase tracking-wider">No Document Available</h3>
        <p className="text-sm font-mono text-muted-foreground max-w-md">Documents will appear here once the pipeline completes compilation.</p>
        <Button onClick={() => void handleRecompile()} disabled={isRecompiling} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${isRecompiling ? "animate-spin" : ""}`} />
          {isRecompiling ? "Regenerating\u2026" : "Regenerate Document"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 bg-muted/30 p-3 rounded-xl border border-border">
        {DOCUMENT_TYPES.map((dt) => {
          const Icon = dt.icon;
          const isActive = selectedDocType === dt.type;
          const isAvailable = allDocs?.some((d) => d.documentType === dt.type);
          return (
            <button key={dt.type} onClick={() => setSelectedDocType(dt.type)} className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all", isActive ? "bg-card shadow-sm border border-border/80 text-foreground" : "text-muted-foreground/70 hover:text-foreground hover:bg-muted/50", !isAvailable && "opacity-40 cursor-not-allowed")}>
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
          <span className="text-xs text-muted-foreground">{DOCUMENT_TYPES.find((d) => d.type === selectedDocType)?.label ?? "Document"}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void handleRecompile()} disabled={isRecompiling} className="gap-2"><RefreshCw className={`h-4 w-4 ${isRecompiling ? "animate-spin" : ""}`} />{isRecompiling ? "Regenerating\u2026" : "Regenerate"}</Button>
          <Button variant="outline" size="sm" onClick={handleCopy} className="gap-2"><Copy className="h-4 w-4" /> Copy</Button>
          <Button variant="outline" size="sm" onClick={handleDownloadAll} className="gap-2"><FolderDown className="h-4 w-4" /> All Docs</Button>
          <Button variant="outline" size="sm" onClick={handleDownload} className="gap-2"><Download className="h-4 w-4" /> Markdown</Button>
        </div>
      </div>

      <Card className="rounded-none border-t-4 border-t-primary">
        <CardContent className="p-8 lg:p-12 max-w-none font-sans">
          <pre className="bg-transparent text-foreground font-sans text-[15px] leading-[1.6] whitespace-pre-wrap p-0 m-0 border-none outline-none resize-none w-full min-h-[200px]" spellCheck={false}>{currentDoc.markdownContent}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
