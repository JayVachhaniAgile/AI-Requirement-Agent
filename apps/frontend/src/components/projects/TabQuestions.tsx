import { useState, useRef } from "react";
import { useListQuestions, useAnswerQuestion, getListQuestionsQueryKey, getGetProjectStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { HelpCircle, AlertCircle, CheckCircle2 } from "lucide-react";
import { STATUS_COLORS } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";

export function TabQuestions({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");

  const { data: questions, isLoading } = useListQuestions(projectId, {
    query: {
      enabled: !!projectId,
      queryKey: getListQuestionsQueryKey(projectId),
    }
  });

  const answerMutation = useAnswerQuestion();
  const mutateFnRef = useRef(answerMutation.mutate);
  mutateFnRef.current = answerMutation.mutate;

  const handleSubmitAnswer = (questionId: string) => {
    if (!answerText.trim()) return;
    
    mutateFnRef.current({ id: projectId, questionId, data: { answer: answerText } }, {
      onSuccess: () => {
        toast({ title: "Answer Submitted", description: "Agents will resume processing." });
        setAnsweringId(null);
        setAnswerText("");
        queryClient.invalidateQueries({ queryKey: getListQuestionsQueryKey(projectId) });
        queryClient.invalidateQueries({ queryKey: getGetProjectStatsQueryKey(projectId) });
      },
      onError: (err: any) => {
        toast({ title: "Submission Failed", description: err.message, variant: "destructive" });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map(i => <Skeleton key={i} className="h-40 w-full" />)}
      </div>
    );
  }

  if (!questions || questions.length === 0) {
    return (
      <div className="text-center p-12 border-2 border-dashed border-border text-muted-foreground uppercase tracking-widest text-sm font-bold">
        No clarification questions yet
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {questions.map((q) => (
        <Card key={q.id} className={q.status === 'PENDING' ? 'border-primary/50 bg-primary/5' : ''}>
          <CardHeader className="py-4 px-6 border-b border-border/50">
            <div className="flex justify-between items-start gap-4">
              <div className="flex gap-3 items-start">
                {q.status === 'PENDING' ? (
                  <HelpCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                )}
                <div>
                  <CardTitle className="text-lg leading-snug">{q.question}</CardTitle>
                  {q.context && (
                    <p className="text-sm font-mono text-muted-foreground mt-2 bg-background p-2 border border-border">
                      {q.context}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <Badge variant={STATUS_COLORS[q.status] || "secondary"}>
                  {q.status}
                </Badge>
                {q.isBlocking && q.status === 'PENDING' && (
                  <Badge variant="destructive" className="flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> BLOCKING
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>

          {q.status === 'PENDING' && answeringId !== q.id && (
            <CardFooter className="p-4 bg-background border-t border-border flex justify-end">
              <Button onClick={() => setAnsweringId(q.id)} variant="outline">
                Provide Answer
              </Button>
            </CardFooter>
          )}

          {q.status === 'PENDING' && answeringId === q.id && (
            <CardFooter className="p-4 bg-background border-t border-border flex flex-col gap-4">
              <Textarea 
                placeholder="Enter your clarification here..." 
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                autoFocus
                className="font-mono"
              />
              <div className="flex justify-end gap-2 w-full">
                <Button variant="ghost" onClick={() => { setAnsweringId(null); setAnswerText(""); }}>
                  Cancel
                </Button>
                <Button onClick={() => handleSubmitAnswer(q.id)} disabled={!answerText.trim() || answerMutation.isPending}>
                  {answerMutation.isPending ? "Submitting..." : "Submit Answer"}
                </Button>
              </div>
            </CardFooter>
          )}

          {q.status === 'ANSWERED' && q.answer && (
            <CardContent className="p-6 bg-muted/40">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">User Provided Answer</span>
                <p className="font-mono text-sm">{q.answer}</p>
              </div>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}
