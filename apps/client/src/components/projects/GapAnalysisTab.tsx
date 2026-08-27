import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Sparkles, RefreshCw, X, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useGapAnalysisSocket } from '@/hooks/use-gap-analysis-socket';
import { apiFetch } from "@/lib/api-fetch";

interface Finding {
  document: string;
  action: 'KEEP' | 'UPDATE' | 'APPEND' | 'DEPRECATE';
  section?: string;
  finding: string;
  explanation: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence?: number;
  suggestion: string;
}

interface ActiveRun {
  id: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'AWAITING_REVIEW' | 'CANCELLED';
  phase: string;
  phaseDetail: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  iteration: number;
}

interface Proposal {
  id: string;
  projectId: string;
  iteration: number;
  documentType: string;
  section: string | null;
  confidence: number | null;
  existingContent: string | null;
  proposedContent: string | null;
  reasonsJson: string | null;
  status: 'PENDING' | 'APPLIED' | 'REJECTED' | 'DISCARDED';
  createdAt: string;
  appliedAt: string | null;
}

interface ProposalReason {
  finding: string;
  explanation: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  section?: string;
  confidence?: number;
  suggestion?: string;
}

interface HistoryRow {
  id: string;
  iteration: number;
  coveragePct: number;
  qualityScore: number;
  totalGaps: number;
  resolvedGaps: number;
  remainingGaps: number;
  summary: string | null;
  findingsJson: string | null;
  documentsUpdatedJson: string | null;
  createdAt: string;
}

interface StatusResponse {
  activeRun: ActiveRun | null;
  proposals: Proposal[];
  history: HistoryRow[];
  appliedFindings: string[];
  applyingFindings: string[];
}

interface LatestView {
  iteration: number;
  coveragePct: number;
  qualityScore: number;
  totalGaps: number;
  resolvedGaps: number;
  remainingGaps: number;
  summary: string;
  findings: Finding[];
  documentsUpdated: string[];
  comparison: {
    coverageDelta: number;
    qualityDelta: number;
    gapsDelta: number;
    resolvedThisIteration: number;
  };
}

const ACTION_STYLES: Record<Finding['action'], string> = {
  KEEP: 'bg-muted text-muted-foreground',
  UPDATE: 'bg-blue-500/15 text-blue-400',
  APPEND: 'bg-emerald-500/15 text-emerald-400',
  DEPRECATE: 'bg-amber-500/15 text-amber-400',
};

const SEVERITY_STYLES: Record<Finding['severity'], string> = {
  LOW: 'bg-muted text-muted-foreground',
  MEDIUM: 'bg-yellow-500/15 text-yellow-400',
  HIGH: 'bg-orange-500/15 text-orange-400',
  CRITICAL: 'bg-red-500/15 text-red-400',
};

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function latestFromHistory(history: HistoryRow[]): LatestView | null {
  if (history.length === 0) return null;
  const rows = [...history].sort((a, b) => a.iteration - b.iteration);
  const latest = rows[rows.length - 1];
  const previous = rows.length >= 2 ? rows[rows.length - 2] : null;
  return {
    iteration: latest.iteration,
    coveragePct: latest.coveragePct,
    qualityScore: latest.qualityScore,
    totalGaps: latest.totalGaps,
    resolvedGaps: latest.resolvedGaps,
    remainingGaps: latest.remainingGaps,
    summary: latest.summary ?? '',
    findings: (JSON.parse(latest.findingsJson ?? '[]') as Finding[]) ?? [],
    documentsUpdated: (JSON.parse(latest.documentsUpdatedJson ?? '[]') as string[]) ?? [],
    comparison: {
      coverageDelta: previous ? latest.coveragePct - previous.coveragePct : 0,
      qualityDelta: previous ? latest.qualityScore - previous.qualityScore : 0,
      gapsDelta: previous ? latest.remainingGaps - previous.remainingGaps : 0,
      resolvedThisIteration: latest.resolvedGaps,
    },
  };
}

export function GapAnalysisTab({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [appliedFindings, setAppliedFindings] = useState<string[]>([]);
  const [applyingFindings, setApplyingFindings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [applyingKey, setApplyingKey] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { connected, activeRun: socketActiveRun } = useGapAnalysisSocket(projectId);

  const fetchStatus = async () => {
    const res = await apiFetch(`/api/projects/${projectId}/gap-analysis`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as {
      activeRun: ActiveRun | null;
      proposals: Proposal[];
      history: HistoryRow[];
      appliedFindings: string[];
      applyingFindings: string[];
    };
  };

  const load = useCallback(async () => {
    try {
      const body = await fetchStatus();
      setActiveRun(body.activeRun);
      setProposals(body.proposals ?? []);
      setHistory(body.history);
      setAppliedFindings(body.appliedFindings ?? []);
      setApplyingFindings(body.applyingFindings ?? []);
    } catch {
      setActiveRun(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll every 3s so proposals, phases, and history stay fresh (survives refresh).
  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [projectId]);

  // Socket gives instant phase updates; refresh proposals immediately when
  // the run pauses for review (or finishes).
  useEffect(() => {
    if (!socketActiveRun) return;
    setActiveRun((prev) => {
      const base = prev ?? { id: '', startedAt: null, completedAt: null };
      return { ...base, ...socketActiveRun } as ActiveRun;
    });
    if (socketActiveRun.status === 'AWAITING_REVIEW' || socketActiveRun.status === 'COMPLETED') {
      void load();
    }
  }, [socketActiveRun]);

  const handleRun = () => {
    setRunning(true);
    apiFetch(`/api/projects/${projectId}/gap-analysis/run`, { method: 'POST' })
      .then(async (res) => {
        if (!res.ok) {
          let msg = `HTTP ${res.status}`;
          try {
            const body = await res.json();
            if (body.message) msg = body.message;
          } catch {
            /* keep default */
          }
          throw new Error(msg);
        }
        const body = (await res.json()) as { started: boolean; alreadyRunning: boolean };
        if (body.alreadyRunning) {
          toast({ title: 'Already Running', description: 'A gap-analysis run is in progress.' });
        } else {
          toast({ title: 'Gap Analysis Started', description: 'Watching progress live...' });
        }
        load();
      })
      .catch((err: Error) => {
        toast({ title: 'Failed to Start', description: err.message, variant: 'destructive' });
      })
      .finally(() => setRunning(false));
  };

  const handleStop = () => {
    setRunning(true);
    apiFetch(`/api/projects/${projectId}/gap-analysis/stop`, { method: 'POST' })
      .then(async (res) => {
        if (!res.ok) {
          let msg = `HTTP ${res.status}`;
          try {
            const body = await res.json();
            if (body.message) msg = body.message;
          } catch {
            /* keep default */
          }
          throw new Error(msg);
        }
        toast({ title: 'Gap Analysis Stopped', description: 'Execution cancelled.' });
        load();
      })
      .catch((err: Error) => {
        toast({ title: 'Failed to Stop', description: err.message, variant: 'destructive' });
      })
      .finally(() => setRunning(false));
  };

  // Apply a single proposal
  const handleApply = async (proposalId: string) => {
    const key = `proposal:${proposalId}`;
    setApplyingKey(key);
    try {
      const res = await apiFetch(
        `/api/projects/${projectId}/gap-analysis/proposals/${proposalId}/apply`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Failed' }));
        toast({ title: 'Apply Failed', description: body.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Gap Applied', description: 'Targeted update saved to the document.' });
      await load();
    } finally {
      setApplyingKey(null);
    }
  };

  // Ignore a proposal
  const handleReject = async (proposalId: string) => {
    const res = await apiFetch(
      `/api/projects/${projectId}/gap-analysis/proposals/${proposalId}/reject`,
      { method: 'POST' },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: 'Failed' }));
      toast({ title: 'Reject Failed', description: body.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Gap Ignored', description: 'Suggestion discarded; no changes made.' });
    load();
  };

  // Apply all pending proposals
  const handleApplyAll = async () => {
    setApplyingKey('all');
    try {
      const res = await apiFetch(`/api/projects/${projectId}/gap-analysis/proposals/apply-all`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Failed' }));
        toast({ title: 'Apply All Failed', description: body.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'All Gaps Applied', description: 'All selected changes were saved.' });
      await load();
    } finally {
      setApplyingKey(null);
    }
  };

  // Apply a gap directly from the findings list (run already completed).
  const handleApplyFinding = async (findingKey: string) => {
    const key = `finding:${findingKey}`;
    setApplyingKey(key);
    try {
      const res = await apiFetch(
        `/api/projects/${projectId}/gap-analysis/findings/${findingKey}/apply`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Failed' }));
        toast({ title: 'Apply Failed', description: body.message, variant: 'destructive' });
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        applied?: boolean;
        alreadyApplied?: boolean;
        alreadyApplying?: boolean;
      };
      if (body.alreadyApplied) {
        toast({ title: 'Already Applied', description: 'This gap was already applied.' });
      } else if (body.alreadyApplying) {
        toast({
          title: 'Still Applying',
          description: 'This gap is already being applied — it will update shortly.',
        });
      } else {
        toast({ title: 'Gap Applied', description: 'Targeted update saved to the document.' });
      }
      await load();
    } finally {
      setApplyingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const latest = latestFromHistory(history);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Gap Analysis</h2>
          <p className="text-sm text-muted-foreground">
            Analyzes all artifacts once, then lets you review each gap and apply targeted,
            section-level changes — never regenerating whole documents.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(activeRun?.status === 'RUNNING' || activeRun?.status === 'AWAITING_REVIEW') && (
            <Button
              onClick={handleStop}
              disabled={running}
              variant="destructive"
              className="gap-2 rounded-xl"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              Stop
            </Button>
          )}
          <Button
            onClick={handleRun}
            disabled={running || activeRun?.status === 'RUNNING'}
            className="gap-2 rounded-xl bg-primary hover:bg-primary-hover"
          >
            {running || activeRun?.status === 'RUNNING' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {activeRun?.status === 'RUNNING' ? 'Running...' : 'Run Gap Analysis'}
          </Button>
        </div>
      </div>

      {activeRun && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
          <div className="flex items-center gap-2">
            {activeRun.status === 'RUNNING' ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : activeRun.status === 'FAILED' ? (
              <span className="text-destructive">✕</span>
            ) : activeRun.status === 'AWAITING_REVIEW' ? (
              <span className="text-warning">⏳</span>
            ) : activeRun.status === 'CANCELLED' ? (
              <X className="h-4 w-4 text-muted-foreground" />
            ) : (
              <RefreshCw className="h-4 w-4 text-success" />
            )}
            <p className="text-sm font-medium text-foreground">
              {activeRun.status === 'RUNNING'
                ? 'Gap Analysis in progress'
                : activeRun.status === 'FAILED'
                  ? 'Gap Analysis failed'
                  : activeRun.status === 'AWAITING_REVIEW'
                    ? 'Awaiting your review'
                    : activeRun.status === 'CANCELLED'
                      ? 'Gap Analysis stopped'
                      : 'Gap Analysis completed'}
            </p>
          </div>
          {activeRun.status === 'RUNNING' && (
            <p className="mt-1 text-sm text-muted-foreground">
              Phase: <span className="font-medium text-foreground">{activeRun.phase}</span>
              {activeRun.phaseDetail ? ` - ${activeRun.phaseDetail}` : ''}
            </p>
          )}
          {activeRun.status === 'AWAITING_REVIEW' && (
            <div className="mt-3 p-3 rounded-lg border border-warning/30 bg-warning/10">
              <p className="text-sm font-medium text-warning">Review Required</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {activeRun.phaseDetail} - Review each gap below, then Apply or Ignore.
              </p>
            </div>
          )}
          {activeRun.status === 'FAILED' && activeRun.error && (
            <p className="mt-1 text-sm text-destructive">{activeRun.error}</p>
          )}
          {activeRun.status !== 'RUNNING' && activeRun.completedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              Finished {new Date(activeRun.completedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {proposals.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-4">
          <h3 className="text-sm font-semibold text-warning mb-3">
            {proposals.length} Proposal{proposals.length > 1 ? 's' : ''} Awaiting Your Review
          </h3>
          <div className="space-y-3">
            {proposals.map((p) => (
              <div key={p.id} className="rounded-lg border border-border bg-card p-4">
                {(() => {
                  let reasons: ProposalReason[] = [];
                  try {
                    reasons = JSON.parse(p.reasonsJson ?? '[]') as ProposalReason[];
                  } catch {
                    reasons = [];
                  }
                  const reason = reasons[0];
                  const priority = reason?.severity ?? 'MEDIUM';
                  return (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <Badge className="text-warning">{p.documentType}</Badge>
                          {p.section && (
                            <Badge variant="outline" className="text-muted-foreground">
                              {p.section}
                            </Badge>
                          )}
                          <Badge className={SEVERITY_STYLES[priority] ?? 'bg-muted'}>
                            {priority} priority
                          </Badge>
                          {p.confidence !== null && p.confidence !== undefined && (
                            <Badge variant="secondary" className="text-xs">
                              {p.confidence}% confidence
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-muted-foreground">
                            Iteration {p.iteration}
                          </Badge>
                        </div>
                        {reason?.finding && (
                          <p className="text-sm font-medium text-foreground">{reason.finding}</p>
                        )}
                        {reason?.explanation && (
                          <p className="mt-1 text-sm text-foreground/80">
                            <em>{reason.explanation}</em>
                          </p>
                        )}
                        {reason?.suggestion && (
                          <p className="mt-1 text-xs text-foreground/70">
                            Suggested change: {reason.suggestion}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          onClick={() => handleApply(p.id)}
                          disabled={applyingKey !== null}
                          className="gap-2 rounded-xl bg-success"
                          size="sm"
                        >
                          {applyingKey === `proposal:${p.id}` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                          {applyingKey === `proposal:${p.id}` ? 'Applying...' : 'Apply'}
                        </Button>
                        <Button
                          onClick={() => handleReject(p.id)}
                          disabled={applyingKey !== null}
                          variant="destructive"
                          size="sm"
                        >
                          <X className="h-3.5 w-3.5" /> Ignore
                        </Button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ))}
            <div className="mt-3 flex gap-2">
              <Button
                onClick={handleApplyAll}
                disabled={applyingKey !== null}
                className="gap-2 rounded-xl bg-primary"
              >
                {applyingKey === 'all' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {applyingKey === 'all' ? 'Applying...' : `Apply All (${proposals.length})`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {latest && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <MetricCard
            label="Coverage"
            value={`${latest.coveragePct}%`}
            sub={
              latest.comparison.coverageDelta !== 0
                ? `${latest.comparison.coverageDelta > 0 ? '+' : ''}${latest.comparison.coverageDelta} pts`
                : undefined
            }
          />
          <MetricCard
            label="Quality"
            value={`${latest.qualityScore}`}
            sub={
              latest.comparison.qualityDelta !== 0
                ? `${latest.comparison.qualityDelta > 0 ? '+' : ''}${latest.comparison.qualityDelta} pts`
                : undefined
            }
          />
          <MetricCard label="Total Gaps" value={String(latest.totalGaps)} />
          <MetricCard label="Resolved" value={String(latest.resolvedGaps)} />
          <MetricCard label="Remaining" value={String(latest.remainingGaps)} />
        </div>
      )}

      {latest && latest.documentsUpdated.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {latest.documentsUpdated.map((doc) => (
            <Badge key={doc} variant="outline" className="text-success">
              Updated: {doc}
            </Badge>
          ))}
        </div>
      )}

      {latest && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Findings</h3>
          {latest.summary && <p className="mt-1 text-sm text-muted-foreground">{latest.summary}</p>}
          <div className="mt-3 space-y-2">
            {latest.findings.length === 0 && (
              <p className="text-sm text-muted-foreground">No gaps found.</p>
            )}
            {latest.findings.map((f, i) => (
              <div key={i} className="rounded-lg border border-border bg-muted/30 p-3">
                {(() => {
                  const findingKey = `${latest.iteration}:${i}`;
                  const isApplied = appliedFindings.includes(findingKey);
                  const isApplying = applyingFindings.includes(findingKey);
                  const isActionable = f.action === 'UPDATE' || f.action === 'APPEND';
                  const showApply =
                    isActionable && activeRun?.status !== 'AWAITING_REVIEW';
                  return (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={ACTION_STYLES[f.action]}>{f.action}</Badge>
                          <Badge className={SEVERITY_STYLES[f.severity]}>{f.severity}</Badge>
                          <span className="text-sm font-medium text-foreground">{f.document}</span>
                          {f.section && (
                            <Badge variant="outline" className="text-muted-foreground">
                              {f.section}
                            </Badge>
                          )}
                          {f.confidence !== undefined && (
                            <span className="text-xs text-muted-foreground">{f.confidence}%</span>
                          )}
                        </div>
                        {showApply &&
                          (isApplied ? (
                            <Badge variant="outline" className="shrink-0 text-success">
                              Applied
                            </Badge>
                          ) : isApplying ? (
                            <Button
                              disabled
                              size="sm"
                              className="shrink-0 gap-2 rounded-xl bg-success opacity-80"
                            >
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Applying...
                            </Button>
                          ) : (
                            <Button
                              onClick={() => handleApplyFinding(findingKey)}
                              disabled={applyingKey !== null}
                              size="sm"
                              className="shrink-0 gap-2 rounded-xl bg-success"
                            >
                              {applyingKey === `finding:${findingKey}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                              {applyingKey === `finding:${findingKey}` ? 'Applying...' : 'Apply'}
                            </Button>
                          ))}
                      </div>
                      <p className="mt-1.5 text-sm text-muted-foreground">{f.finding}</p>
                      {f.explanation && (
                        <p className="mt-1 text-sm text-foreground/80">
                          <em>{f.explanation}</em>
                        </p>
                      )}
                      {f.suggestion && (
                        <p className="mt-1 text-xs text-foreground/70">Action: {f.suggestion}</p>
                      )}
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Analysis History</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3">Iteration</th>
                  <th className="py-2 pr-3">Coverage</th>
                  <th className="py-2 pr-3">Quality</th>
                  <th className="py-2 pr-3">Total</th>
                  <th className="py-2 pr-3">Resolved</th>
                  <th className="py-2 pr-3">Remaining</th>
                  <th className="py-2 pr-3">Docs Updated</th>
                  <th className="py-2">When</th>
                </tr>
              </thead>
              <tbody>
                {[...history]
                  .sort((a, b) => a.iteration - b.iteration)
                  .map((h) => (
                    <tr key={h.id} className="border-b border-border/60">
                      <td className="py-2 pr-3 font-medium text-foreground">#{h.iteration}</td>
                      <td className="py-2 pr-3">{h.coveragePct}%</td>
                      <td className="py-2 pr-3">{h.qualityScore}</td>
                      <td className="py-2 pr-3">{h.totalGaps}</td>
                      <td className="py-2 pr-3 text-success">{h.resolvedGaps}</td>
                      <td className="py-2 pr-3">{h.remainingGaps}</td>
                      <td className="py-2 pr-3">
                        {h.documentsUpdatedJson
                          ? ((JSON.parse(h.documentsUpdatedJson) as string[]) ?? []).join(', ')
                          : '-'}
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {new Date(h.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
