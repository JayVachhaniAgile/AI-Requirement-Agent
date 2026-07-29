import type { ProjectDashboard } from "@/lib/dashboard-types";
import { Button } from "@/components/ui/button";
import { Download, Eye, FileDown } from "lucide-react";

export function DocumentSummaryFooter({
  dashboard,
  onPreview,
  onDownload,
}: {
  dashboard: ProjectDashboard | undefined;
  onPreview: () => void;
  onDownload: () => void;
}) {
  const stats = dashboard?.documentStats;
  const items = [
    { label: "Sections", value: stats?.sections ?? 0 },
    { label: "Pages", value: stats?.pages ?? 0 },
    { label: "Diagrams", value: stats?.diagrams ?? 0 },
    { label: "Tables", value: stats?.tables ?? 0 },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-sm font-bold text-foreground">Final Document Summary</p>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {items.map((item) => (
            <span key={item.label}>
              <strong className="text-foreground">{item.value}</strong> {item.label}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="rounded-xl"
          onClick={onPreview}
          disabled={!dashboard?.hasDocument}
        >
          <Eye className="mr-2 h-4 w-4" />
          Preview Document
        </Button>
        <Button
          className="rounded-xl bg-primary hover:bg-primary-hover"
          onClick={onDownload}
          disabled={!dashboard?.hasDocument}
        >
          <Download className="mr-2 h-4 w-4" />
          Download MD
        </Button>
        <Button variant="ghost" className="rounded-xl text-muted-foreground" disabled title="PDF export coming soon">
          <FileDown className="mr-2 h-4 w-4" />
          PDF
        </Button>
      </div>
    </div>
  );
}
