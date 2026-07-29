import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { FileText, Clock, Eye, Download, ChevronRight, BookOpen, BarChart3, Layout } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { fetchAllDocuments, type AggDocument } from "@/lib/aggregate-api";
import { format } from "date-fns";

export default function DocumentsHubPage() {
  const [, setLocation] = useLocation();
  const { data: documents, isLoading } = useQuery<AggDocument[]>({
    queryKey: ["aggregate", "documents"],
    queryFn: fetchAllDocuments,
  });

  const totalWordCount = documents?.reduce((s, d) => s + d.stats.wordCount, 0) ?? 0;
  const totalPages = documents?.reduce((s, d) => s + d.stats.pages, 0) ?? 0;
  const totalSections = documents?.reduce((s, d) => s + d.stats.sections, 0) ?? 0;
  const avgConfidence = documents?.length
    ? Math.round(documents.reduce((s, d) => s + (d.confidence ?? 0), 0) / documents.length)
    : 0;

  const handleDownload = (doc: AggDocument) => {
    const filename = `${doc.projectName.replace(/\s+/g, "-").toLowerCase()}-requirements.md`;
    const url = URL.createObjectURL(new Blob([`# ${doc.projectName} — Requirements\n`], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Documents</h1>
        <p className="text-muted-foreground text-sm mt-1">All generated requirements documents</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-56 w-full rounded-2xl" />)}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Documents" value={documents?.length ?? 0} icon={<FileText className="h-4 w-4" />} />
            <StatCard label="Total Words" value={totalWordCount.toLocaleString()} icon={<BookOpen className="h-4 w-4" />} />
            <StatCard label="Total Pages" value={String(totalPages)} icon={<Layout className="h-4 w-4" />} />
            <StatCard label="Avg Confidence" value={`${avgConfidence}%`} icon={<BarChart3 className="h-4 w-4" />} className="text-primary" />
          </div>

          {documents && documents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {documents.map((doc) => (
                <Card
                  key={doc.id}
                  className="group cursor-pointer rounded-2xl border-border shadow-sm hover:border-primary/30 hover:shadow-md transition-all"
                  onClick={() => setLocation(`/projects/${doc.projectId}`)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start gap-3">
                      <CardTitle className="text-sm line-clamp-2">{doc.projectName}</CardTitle>
                      <Badge variant={doc.status === "FINAL" ? "success" : "secondary"} className="shrink-0 text-[10px]">
                        {doc.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3 text-xs mb-4">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <BookOpen className="h-3.5 w-3.5 text-primary" />
                        <span><strong>{doc.stats.sections}</strong> sections</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <FileText className="h-3.5 w-3.5 text-success" />
                        <span><strong>{doc.stats.pages}</strong> pages</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Layout className="h-3.5 w-3.5 text-info" />
                        <span><strong>{doc.stats.diagrams}</strong> diagrams</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <BarChart3 className="h-3.5 w-3.5 text-warning" />
                        <span><strong>{doc.stats.wordCount.toLocaleString()}</strong> words</span>
                      </div>
                    </div>

                    {doc.confidence !== null && (
                      <div className="flex items-center gap-2 mb-4 p-2 bg-muted/30 rounded-xl">
                        <span className="text-xs text-muted-foreground">AI Confidence</span>
                        <div className="flex-1 bg-muted/50 rounded-full h-1.5">
                          <div className="bg-primary h-1.5 rounded-full" style={{ width: `${doc.confidence}%` }} />
                        </div>
                        <span className="text-xs font-bold text-foreground">{doc.confidence}%</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-3 border-t border-border/50">
                      <span className="flex items-center text-xs text-muted-foreground">
                        <Clock className="h-3 w-3 mr-1" />
                        {format(new Date(doc.updatedAt), "MMM d, yyyy")}
                      </span>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); }}>
                          <Eye className="h-3.5 w-3.5 mr-1" /> View
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); handleDownload(doc); }}>
                          <Download className="h-3.5 w-3.5 mr-1" /> MD
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="rounded-2xl border-dashed border-2">
              <CardContent className="p-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                <h2 className="text-lg font-bold mb-2">No Documents Generated</h2>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Documents will appear here once projects complete their analysis pipeline.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, className }: { label: string; value: string | number; icon: React.ReactNode; className?: string }) {
  return (
    <Card className="rounded-2xl border-border shadow-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-muted/40 ${className ?? "text-muted-foreground"}`}>
          {icon}
        </div>
        <div>
          <p className="text-xl font-bold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
