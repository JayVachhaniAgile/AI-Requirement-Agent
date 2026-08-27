import { useEffect, useState } from 'react';
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, AlertCircle, CheckCircle2, HelpCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getGetProjectQueryKey, getGetProjectProgressQueryKey } from '@workspace/api-client-react';
import { fetchProjectDashboard, getProjectDashboardQueryKey } from '@/lib/project-api';
import { apiFetch } from "@/lib/api-fetch";

interface CheckpointData {
  ideaInterpretation: string;
  problemStatement: string;
  proposedSolution: string;
  initialScope: string | null;
  status: string;
  questions: Array<{
    id: string;
    question: string;
    context: string | null;
    isBlocking: boolean;
    status: string;
    answer: string | null;
  }>;
  canProceed: boolean;
}

interface Edits {
  ideaInterpretation: string;
  problemStatement: string;
  proposedSolution: string;
  initialScope: string;
}

export function DiscoveryCheckpointCard({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [data, setData] = useState<CheckpointData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Edits | null>(null);

  const load = useCallback(() => {
    apiFetch(`/api/projects/${projectId}/discovery-confirmation`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body: CheckpointData = await res.json();
        setData(body);
        setEdits((prev) => ({
          ideaInterpretation: body.ideaInterpretation ?? prev?.ideaInterpretation ?? '',
          problemStatement: body.problemStatement ?? prev?.problemStatement ?? '',
          proposedSolution: body.proposedSolution ?? prev?.proposedSolution ?? '',
          initialScope: body.initialScope ?? prev?.initialScope ?? '',
        }));
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    let active = true;
    if (active) load();
    return () => {
      active = false;
    };
  }, [load]);

  const handleAnswer = (questionId: string) => {
    const answer = (answers[questionId] ?? '').trim();
    if (!answer) return;
    setAnsweringId(questionId);
    apiFetch(`/api/projects/${projectId}/questions/${questionId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer }),
    })
      .then(async (res) => {
        if (!res.ok) {
          let msg = `HTTP ${res.status}`;
          try {
            const body = await res.json();
            if (body.message) msg = body.message;
          } catch {
            /* keep default message */
          }
          throw new Error(msg);
        }
        toast({ title: 'Answer Submitted', description: 'Question answered.' });
        setAnswers((prev) => ({ ...prev, [questionId]: '' }));
        load();
      })
      .catch((err: Error) => {
        toast({
          title: 'Failed to submit answer',
          description: err.message,
          variant: 'destructive',
        });
      })
      .finally(() => setAnsweringId(null));
  };

  const pendingBlocking =
    data?.questions.filter((q) => q.isBlocking && q.status === 'PENDING') ?? [];
  const canConfirm = data?.canProceed === true && !submitting;

  const handleConfirm = () => {
    if (!edits) return;
    setSubmitting(true);
    apiFetch(`/api/projects/${projectId}/discovery-confirmation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(edits),
    })
      .then(async (res) => {
        if (!res.ok) {
          let msg = `HTTP ${res.status}`;
          try {
            const body = await res.json();
            if (body.message) msg = body.message;
          } catch {
            /* keep default message */
          }
          throw new Error(msg);
        }
        toast({
          title: 'Interpretation Confirmed',
          description: 'Pipeline continuing from Research.',
        });
        void queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
        void queryClient.invalidateQueries({ queryKey: getGetProjectProgressQueryKey(projectId) });
        void queryClient.invalidateQueries({ queryKey: getProjectDashboardQueryKey(projectId) });
        void fetchProjectDashboard(projectId);
      })
      .catch((err: Error) => {
        toast({ title: 'Failed to confirm', description: err.message, variant: 'destructive' });
      })
      .finally(() => setSubmitting(false));
  };

  if (loading) {
    return (
      <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!data || !edits) return null;

  const hasBlocking = data.questions.some((q) => q.isBlocking);

  return (
    <div className="rounded-2xl border border-primary/40 bg-primary/5 p-5">
      <div className="mb-4 flex items-center gap-2">
        <HelpCircle className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">
          Confirm the Discovery Interpretation
        </h2>
        <Badge variant="outline" className="ml-auto">
          Step 1 of 14 — waiting for your review
        </Badge>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Review how the AI understood your idea. Edit anything that is wrong — the corrected version
        is what Research and all downstream agents will use.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Idea Interpretation</span>
          <Textarea
            value={edits.ideaInterpretation}
            onChange={(e) => setEdits({ ...edits, ideaInterpretation: e.target.value })}
            rows={4}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Problem Statement</span>
          <Textarea
            value={edits.problemStatement}
            onChange={(e) => setEdits({ ...edits, problemStatement: e.target.value })}
            rows={4}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Proposed Solution</span>
          <Textarea
            value={edits.proposedSolution}
            onChange={(e) => setEdits({ ...edits, proposedSolution: e.target.value })}
            rows={4}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Initial Scope</span>
          <Textarea
            value={edits.initialScope}
            onChange={(e) => setEdits({ ...edits, initialScope: e.target.value })}
            rows={4}
          />
        </label>
      </div>

      {hasBlocking && (
        <div className="mt-4 space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Clarifying Questions</h3>
          {data.questions
            .filter((q) => q.isBlocking)
            .map((q) => (
              <div
                key={q.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{q.question}</p>
                  {q.answer ? (
                    <p className="mt-1 text-sm text-muted-foreground">Answer: {q.answer}</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <Textarea
                        value={answers[q.id] ?? ''}
                        onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                        placeholder="Type your answer…"
                        rows={2}
                        className="w-full"
                      />
                      <div className="flex justify-end">
                        <Button
                          onClick={() => handleAnswer(q.id)}
                          disabled={answeringId === q.id || !(answers[q.id] ?? '').trim()}
                          className="gap-2 rounded-xl bg-primary hover:bg-primary-hover"
                          size="sm"
                        >
                          {answeringId === q.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" />
                          )}
                          Answer
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                {q.status === 'ANSWERED' || q.answer ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                ) : (
                  <AlertCircle className="h-5 w-5 shrink-0 text-warning" />
                )}
              </div>
            ))}
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {pendingBlocking.length > 0
            ? `Answer ${pendingBlocking.length} blocking question${pendingBlocking.length > 1 ? 's' : ''} to continue.`
            : 'No blocking questions — confirm to continue automatically.'}
        </p>
        <Button
          onClick={handleConfirm}
          disabled={!canConfirm}
          className="gap-2 rounded-xl bg-primary hover:bg-primary-hover"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          {data.status === 'CONFIRMED' ? 'Continue Analysis' : 'Looks Right — Continue'}
        </Button>
      </div>
    </div>
  );
}
