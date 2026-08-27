import { useState, useCallback, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Send, Bot, User, Loader2, Sparkles, ArrowRight, Upload, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MicButton } from "@/components/ui/mic-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api-fetch";

interface Message {
  role: "ai" | "user";
  content: string;
}

interface InterviewSession {
  id: string;
  projectName: string;
  status: string;
}

interface UploadedFile {
  file: File;
  id: string;
}

function loadSaved<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function saveTo<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* ignore */ }
}

export function AiInterview({ onComplete }: { onComplete?: () => void }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [initialIdea, setInitialIdea] = useState("");
  const [session, setSession] = useState<InterviewSession | null>(loadSaved<InterviewSession | null>("interview_session", null));
  const [messages, setMessages] = useState<Message[]>(loadSaved<Message[]>("interview_messages", []));
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Recover session from localStorage on mount
  useEffect(() => {
    if (session && messages.length === 0 && !isComplete) {
      const recoverSession = async () => {
        try {
          const res = await apiFetch(`/api/interviews/${session.id}`);
          if (!res.ok) {
            if (res.status === 404) {
              // Session not found on server — try to continue or inform user
              clearSession();
              toast({
                title: "Session Not Found",
                description: "Your previous interview session was lost. Please start a new one.",
                variant: "destructive",
              });
              return;
            }
            throw new Error("Failed to recover session");
          }
          const data = await res.json();
          const msgs = data.history || [];
          setMessages(msgs);
          saveTo("interview_messages", msgs);
          if (data.status === "complete") {
            setIsComplete(true);
          }
        } catch {
          // If network error, keep the saved messages but show warning
          const saved = loadSaved<Message[]>("interview_messages", []);
          if (saved.length > 0) {
            setMessages(saved);
          } else {
            clearSession();
          }
        }
      };
      recoverSession();
    }
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem("interview_session");
    localStorage.removeItem("interview_messages");
    setSession(null);
    setMessages([]);
    setCurrentAnswer("");
    setIsComplete(false);
    setProjectId(null);
    setUploadedFiles([]);
  }, []);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  const addFiles = useCallback((files: FileList | File[]) => {
    const newFiles: UploadedFile[] = Array.from(files)
      .filter((f) => f.size > 0)
      .map((file) => ({
        file,
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      }));
    setUploadedFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) addFiles(e.target.files);
    e.target.value = "";
  }, [addFiles]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleStart = async () => {
    if (!name.trim()) {
      toast({ title: "Validation Error", description: "Please provide a project name.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      // Read uploaded files content
      let combinedIdea = initialIdea.trim() || "";
      if (uploadedFiles.length > 0) {
        const fileContents: string[] = [];
        for (const { file } of uploadedFiles) {
          try {
            const text = await file.text();
            fileContents.push(`--- ${file.name} ---\n${text}`);
          } catch {
            fileContents.push(`--- ${file.name} ---\n[Unable to read file content]`);
          }
        }
        if (fileContents.length > 0) {
          combinedIdea = combinedIdea
            ? `${combinedIdea}\n\n## Uploaded Files\n\n${fileContents.join("\n\n")}`
            : `## Uploaded Files\n\n${fileContents.join("\n\n")}`;
        }
      }

      const res = await apiFetch("/api/interviews/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), idea: combinedIdea || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to start interview");
      const data = await res.json();
      const newSession = { id: data.id, projectName: data.projectName, status: data.status };
      setSession(newSession);
      saveTo("interview_session", newSession);
      const msgs = data.history || [];
      setMessages(msgs);
      saveTo("interview_messages", msgs);
      scrollToBottom();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnswer = async () => {
    if (!currentAnswer.trim() || !session) return;
    setIsLoading(true);
    const userMsg = currentAnswer.trim();
    setCurrentAnswer("");
    setMessages((prev) => {
      const updated = [...prev, { role: "user" as const, content: userMsg }];
      saveTo("interview_messages", updated);
      return updated;
    });

    try {
      const res = await apiFetch(`/api/interviews/${session.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: userMsg }),
      });
      if (!res.ok) {
        const errData = await res.json();
        if (res.status === 404 && String(errData.message).toLowerCase().includes("session")) {
          clearSession();
          toast({ title: "Session Expired", description: "Please start a new interview.", variant: "destructive" });
          return;
        }
        // If we get an error but still have the session, try to recover
        if (res.status === 500 || res.status === 502 || res.status === 503) {
          toast({
            title: "Server Error",
            description: "The AI service encountered an error. Please try again.",
            variant: "destructive",
          });
          return;
        }
        throw new Error(errData.message || "Failed to send answer");
      }
      const data = await res.json();

      if (data.complete && data.projectId) {
        setIsComplete(true);
        setProjectId(data.projectId);
        clearSession();
        toast({
          title: "Interview Complete!",
          description: "Your requirements have been gathered.",
        });
      } else if (data.newQuestions) {
        const newQs = data.newQuestions.map((q: string) => ({ role: "ai" as const, content: q }));
        setMessages((prev) => {
          const updated = [...prev, ...newQs];
          saveTo("interview_messages", updated);
          return updated;
        });
      }
      scrollToBottom();
    } catch (err: any) {
      // On network error, let user retry
      setMessages((prev) => {
        const updated = [...prev];
        saveTo("interview_messages", updated);
        return updated;
      });
      toast({ title: "Connection Error", description: "Please check your connection and try again.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAnswer();
    }
  };

  if (isComplete && projectId) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-8 text-center">
          <Sparkles className="mx-auto h-12 w-12 text-primary mb-4" />
          <h2 className="text-xl font-bold mb-2">Interview Complete!</h2>
          <p className="text-muted-foreground mb-6">
            All requirements have been gathered. Ready to start the AI analysis.
          </p>
          <div className="flex justify-center gap-3">
            <Button variant="ghost" onClick={clearSession}>New Interview</Button>
            <Button onClick={() => setLocation(`/projects/${projectId}`)} className="gap-2">
              Go to Project <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!session) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            AI-Powered Requirements Interview
          </CardTitle>
          <CardDescription>
            Instead of a form, our AI asks smart questions to gather complete requirements.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-semibold mb-1.5">Project Name *</label>
            <Input placeholder="e.g. Acme Inventory Tracker" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-semibold mb-1.5">Initial Idea (optional)</label>
            <div className="relative">
                            <Textarea placeholder="Briefly describe what you want to build..." value={initialIdea} onChange={(e) => setInitialIdea(e.target.value)} className="min-h-[100px]" />
                            <div className="absolute top-2 right-2 z-10">
                              <MicButton onTranscript={(t) => setInitialIdea((prev) => prev + " " + t)} />
                            </div>
                          </div>
          </div>
          {/* File Upload for Interview */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold mb-1.5">Upload Requirement Files (optional)</label>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                isDragging ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50"
              }`}
            >
              <input ref={fileInputRef} type="file" multiple accept=".txt,.md,.pdf,.doc,.docx,.csv,.json,.xml,.yaml,.yml" onChange={handleFileSelect} className="hidden" />
              <Upload className="mx-auto h-5 w-5 text-muted-foreground mb-1" />
              <p className="text-xs font-medium">{isDragging ? "Drop files" : "Drag & drop or click"}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">.txt, .md, .csv, .json, .xml, .yaml</p>
            </div>
            {uploadedFiles.length > 0 && (
              <ul className="space-y-1 mt-2">
                {uploadedFiles.map(({ file, id }) => (
                  <li key={id} className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-1.5 text-xs">
                    <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{file.name}</span>
                    <span className="text-muted-foreground">{formatFileSize(file.size)}</span>
                    <button type="button" onClick={(e) => { e.stopPropagation(); removeFile(id); }} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Button onClick={handleStart} disabled={isLoading || !name.trim()} className="w-full gap-2">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
            {isLoading ? "Starting..." : "Start Interview"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-[600px]">
      <CardHeader className="border-b shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-5 w-5 text-primary" />
            Interview: {session.projectName}
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setLocation(`/projects/new`)}>
              New
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSession}>Restart</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
            {msg.role === "ai" && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Bot className="h-4 w-4" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${msg.role === "ai" ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"}`}>
              {msg.content}
            </div>
            {msg.role === "user" && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Bot className="h-4 w-4" />
            </div>
            <div className="rounded-2xl bg-muted px-4 py-2.5">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </CardContent>
      <div className="border-t p-4 shrink-0">
        <div className="flex gap-2">
          <Input placeholder="Type your answer..." value={currentAnswer} onChange={(e) => setCurrentAnswer(e.target.value)} onKeyDown={handleKeyDown} disabled={isLoading} autoFocus />
          <Button onClick={handleAnswer} disabled={isLoading || !currentAnswer.trim()} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
