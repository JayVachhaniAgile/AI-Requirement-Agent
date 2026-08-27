import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeftRight, Clock, FileText, GitCompare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { apiFetch } from "@/lib/api-fetch";

interface DocumentVersion {
  id: string;
  projectId: string;
  documentType: string;
  version: number;
  markdownContent: string;
  changeSummary: string | null;
  affectedItemIds: string[];
  triggerEvent: string | null;
  createdAt: string;
}

function computeDiff(
  oldText: string,
  newText: string,
): { type: 'added' | 'removed' | 'unchanged'; text: string }[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const result: { type: 'added' | 'removed' | 'unchanged'; text: string }[] = [];

  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    if (i >= oldLines.length) {
      result.push({ type: 'added', text: newLines[i] });
    } else if (i >= newLines.length) {
      result.push({ type: 'removed', text: oldLines[i] });
    } else if (oldLines[i] !== newLines[i]) {
      result.push({ type: 'removed', text: oldLines[i] });
      result.push({ type: 'added', text: newLines[i] });
    } else {
      result.push({ type: 'unchanged', text: oldLines[i] });
    }
  }
  return result;
}

export function VersionDiffViewer({ projectId }: { projectId: string }) {
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [compareVersion, setCompareVersion] = useState<number | null>(null);
  const [mode, setMode] = useState<'view' | 'diff'>('view');
  const [documentType, setDocumentType] = useState<string>('all');

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    apiFetch(`/api/projects/${projectId}/versions`)
      .then((r) => r.json())
      .then((data) => {
        const all = Array.isArray(data) ? data : [];
        setVersions(all);
        if (all.length > 0) {
          setDocumentType(all[0].documentType ?? 'all');
          setSelectedVersion(all[0].version);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  const visibleVersions =
    documentType === 'all' ? versions : versions.filter((v) => v.documentType === documentType);
  const currentVersion = visibleVersions.find((v) => v.version === selectedVersion);
  const compareV = visibleVersions.find((v) => v.version === compareVersion);
  const documentTypes = Array.from(new Set(versions.map((v) => v.documentType))).sort();

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="text-center p-12 border-2 border-dashed border-border rounded-xl">
        <GitCompare className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
        <h3 className="text-lg font-semibold">No Versions Yet</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Versions will appear here after document compilation.
        </p>
      </div>
    );
  }

  const diffLines =
    mode === 'diff' && currentVersion && compareV
      ? computeDiff(compareV.markdownContent, currentVersion.markdownContent)
      : null;

  return (
    <div className="space-y-4">
      {/* Version selector */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" /> {versions.length} version(s)
          </Badge>
          {documentTypes.length > 1 && (
            <select
              className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
              value={documentType}
              onChange={(e) => {
                const next = e.target.value;
                setDocumentType(next);
                const first = (
                  next === 'all' ? versions : versions.filter((v) => v.documentType === next)
                )[0];
                setSelectedVersion(first ? first.version : null);
                setCompareVersion(null);
                setMode('view');
              }}
            >
              <option value="all">All documents</option>
              {documentTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
          {currentVersion?.documentType && (
            <Badge variant="secondary" className="text-xs">
              {currentVersion.documentType}
            </Badge>
          )}
          {currentVersion?.triggerEvent && (
            <Badge variant="secondary" className="text-xs">
              {currentVersion.triggerEvent}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
            value={selectedVersion ?? ''}
            onChange={(e) => setSelectedVersion(Number(e.target.value))}
          >
            {visibleVersions.map((v) => (
              <option key={v.version} value={v.version}>
                v{v.version} — {new Date(v.createdAt).toLocaleDateString()}
              </option>
            ))}
          </select>
          {mode === 'view' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setMode('diff');
                if (!compareVersion && visibleVersions.length > 1) {
                  // Pick the immediately older version (versions are DESC)
                  const idx = visibleVersions.findIndex((v) => v.version === selectedVersion);
                  const older =
                    idx >= 0 && idx < visibleVersions.length - 1
                      ? visibleVersions[idx + 1]
                      : visibleVersions[1] || visibleVersions[0];
                  if (older && older.version !== selectedVersion) setCompareVersion(older.version);
                }
              }}
              className="gap-1"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" /> Compare
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setMode('view')} className="gap-1">
              <FileText className="h-3.5 w-3.5" /> View
            </Button>
          )}
        </div>
      </div>

      {/* Diff mode selector */}
      {mode === 'diff' && (
        <div className="flex items-center gap-2 bg-muted/40 rounded-xl p-3 border">
          <span className="text-sm font-medium">Compare:</span>
          <select
            className="rounded-lg border border-input bg-background px-3 py-1 text-sm"
            value={compareVersion ?? ''}
            onChange={(e) => setCompareVersion(Number(e.target.value))}
          >
            {visibleVersions
              .filter((v) => v.version !== selectedVersion)
              .map((v) => (
                <option key={v.version} value={v.version}>
                  v{v.version} — {new Date(v.createdAt).toLocaleDateString()}
                </option>
              ))}
          </select>
          <span className="text-sm text-muted-foreground">vs</span>
          <span className="text-sm font-semibold">v{selectedVersion}</span>
        </div>
      )}

      {/* Change summary */}
      {currentVersion?.changeSummary && (
        <div className="rounded-xl bg-primary/5 border border-primary/20 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Change Summary
          </p>
          <p className="text-sm mt-1">{currentVersion.changeSummary}</p>
        </div>
      )}

      {/* Affected items */}
      {currentVersion && currentVersion.affectedItemIds.length > 0 && (
        <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-4">
          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
            Impact Analysis — {currentVersion.affectedItemIds.length} item(s) affected
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            This version touches {currentVersion.affectedItemIds.length} requirements, diagrams, or
            other artifacts.
          </p>
        </div>
      )}

      {/* Content */}
      <Card className="border-t-4 border-t-primary">
        <CardHeader className="py-3 px-4 border-b bg-muted/20">
          <CardTitle className="text-sm font-semibold">
            {mode === 'view'
              ? `Version ${selectedVersion}`
              : `Diff: v${compareVersion} → v${selectedVersion}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 lg:p-8">
          {mode === 'view' && currentVersion && (
            <div className="prose prose-slate dark:prose-invert max-w-none text-sm">
              <ReactMarkdown>{currentVersion.markdownContent}</ReactMarkdown>
            </div>
          )}
          {mode === 'diff' && diffLines && (
            <div className="font-mono text-xs leading-relaxed">
              {diffLines.map((line, i) => (
                <div
                  key={i}
                  className={`px-3 py-0.5 ${
                    line.type === 'added'
                      ? 'bg-success/10 text-success-foreground border-l-2 border-success'
                      : line.type === 'removed'
                        ? 'bg-destructive/10 text-destructive-foreground border-l-2 border-destructive'
                        : 'text-muted-foreground'
                  }`}
                >
                  <span className="mr-2 select-none">
                    {line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' '}
                  </span>
                  {line.text || ' '}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
