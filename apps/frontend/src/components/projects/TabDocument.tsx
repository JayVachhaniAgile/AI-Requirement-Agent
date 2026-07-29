import { useState } from "react";
import { useGetDocument, getGetDocumentQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Download, FileText, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useToast } from "@/hooks/use-toast";
import { recompileProjectDocument } from "@/lib/project-api";

export function TabDocument({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isRecompiling, setIsRecompiling] = useState(false);
  const { data: doc, isLoading } = useGetDocument(projectId, {
    query: {
      enabled: !!projectId,
      queryKey: getGetDocumentQueryKey(projectId),
    },
  });

  const handleCopy = () => {
    if (doc?.markdownContent) {
      void navigator.clipboard.writeText(doc.markdownContent);
      toast({ title: "Copied to clipboard" });
    }
  };

  const handleDownload = () => {
    if (doc?.markdownContent) {
      const blob = new Blob([doc.markdownContent], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `requirements_${projectId}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleRecompile = async () => {
    setIsRecompiling(true);
    try {
      await recompileProjectDocument(projectId);
      await queryClient.invalidateQueries({ queryKey: getGetDocumentQueryKey(projectId) });
      toast({
        title: "Document regenerated",
        description: "Detailed package rebuilt from full pipeline knowledge.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Recompile failed";
      toast({ title: "Regenerate failed", description: message, variant: "destructive" });
    } finally {
      setIsRecompiling(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-end gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!doc || !doc.markdownContent) {
    return (
      <div className="text-center p-12 border-2 border-dashed border-border flex flex-col items-center justify-center gap-4">
        <FileText className="h-12 w-12 text-muted-foreground/50" />
        <h3 className="text-lg font-bold uppercase tracking-wider">No Document Available</h3>
        <p className="text-sm font-mono text-muted-foreground max-w-md">
          The requirements document will appear here once compilation completes. If agents already finished, regenerate from stored knowledge.
        </p>
        <Button onClick={() => void handleRecompile()} disabled={isRecompiling} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${isRecompiling ? "animate-spin" : ""}`} />
          {isRecompiling ? "Regenerating…" : "Regenerate Document"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-muted/40 p-4 border border-border">
        <div className="flex items-center gap-3">
          <Badge variant={doc.status === "FINAL" ? "success" : "warning"}>
            {doc.status}
          </Badge>
          {doc.validationScore && (
            <span className="text-sm font-mono text-muted-foreground">
              Score: {doc.validationScore}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleRecompile()}
            disabled={isRecompiling}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRecompiling ? "animate-spin" : ""}`} />
            {isRecompiling ? "Regenerating…" : "Regenerate"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopy} className="gap-2">
            <Copy className="h-4 w-4" /> Copy
          </Button>
          <Button size="sm" onClick={handleDownload} className="gap-2">
            <Download className="h-4 w-4" /> Download
          </Button>
        </div>
      </div>

      <Card className="rounded-none border-t-4 border-t-primary">
        <CardContent className="p-8 lg:p-12 prose prose-slate dark:prose-invert max-w-none font-sans">
          <ReactMarkdown>{doc.markdownContent}</ReactMarkdown>
        </CardContent>
      </Card>
    </div>
  );
}
