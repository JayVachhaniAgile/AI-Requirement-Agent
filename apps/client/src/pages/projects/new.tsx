import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useCreateProject, useUploadProjectFiles } from "@workspace/api-client-react";
import { ArrowRight, Upload, FileText, X, Bot, MessageSquareText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MicButton } from "@/components/ui/mic-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { AiInterview } from "@/components/projects/AiInterview";

interface UploadedFile {
  file: File;
  id: string;
}

type EntryMode = "manual" | "interview";

export default function NewProjectPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createProject = useCreateProject();
  const uploadProjectFilesMutation = useUploadProjectFiles();

  const [mode, setMode] = useState<EntryMode>("manual");
  const [name, setName] = useState("");
  const [idea, setIdea] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mutationFnRef = useRef(createProject.mutate);
  mutationFnRef.current = createProject.mutate;

  const isPending = createProject.isPending || uploadProjectFilesMutation.isPending;

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: "Validation Error", description: "Project name is required.", variant: "destructive" });
      return;
    }
    const hasManualIdea = idea.trim().length > 0;
    const hasFiles = uploadedFiles.length > 0;
    if (!hasManualIdea && !hasFiles) {
      toast({ title: "Validation Error", description: "Describe your idea or upload files.", variant: "destructive" });
      return;
    }

    if (hasFiles) {
      uploadProjectFilesMutation.mutate(
        { name: name.trim(), files: uploadedFiles.map((f) => f.file), idea: hasManualIdea ? idea.trim() : undefined },
        {
          onSuccess: (project) => {
            toast({ title: "Project Initialized", description: "Files uploaded. Agents ready for analysis." });
            setLocation(`/projects/${project.id}`);
          },
          onError: (err: any) => toast({ title: "Upload Failed", description: err.message, variant: "destructive" }),
        }
      );
    } else {
      mutationFnRef.current(
        { data: { name: name.trim(), idea: idea.trim() } },
        {
          onSuccess: (project) => {
            toast({ title: "Project Initialized", description: "Agents are ready for analysis." });
            setLocation(`/projects/${project.id}`);
          },
          onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
        }
      );
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">New Analysis</h1>
        <p className="text-muted-foreground mt-1">Choose how to provide your requirements</p>
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-3 mb-8">
        <button
          onClick={() => setMode("manual")}
          className={`flex-1 rounded-xl border-2 p-4 text-left transition-all ${
            mode === "manual"
              ? "border-primary bg-primary/5"
              : "border-border hover:border-muted-foreground/30"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <MessageSquareText className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <p className="font-semibold">Manual Entry</p>
              <p className="text-xs text-muted-foreground">Type your requirements or upload files</p>
            </div>
          </div>
        </button>
        <button
          onClick={() => setMode("interview")}
          className={`flex-1 rounded-xl border-2 p-4 text-left transition-all ${
            mode === "interview"
              ? "border-primary bg-primary/5"
              : "border-border hover:border-muted-foreground/30"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold">AI Interview</p>
              <p className="text-xs text-muted-foreground">Interactive Q&A to gather requirements</p>
            </div>
          </div>
        </button>
      </div>

      {mode === "interview" ? (
        <AiInterview />
      ) : (
        <Card>
          <form onSubmit={handleSubmit}>
            <CardHeader>
              <CardTitle>Manual Entry</CardTitle>
              <CardDescription>Describe your idea or upload requirement documents</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="name" className="block text-sm font-semibold mb-1.5">Project Name</label>
                <Input id="name" placeholder="e.g. Acme Inventory Tracker" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </div>
              <div className="space-y-2">
                <label htmlFor="idea" className="text-sm font-semibold flex justify-between mb-1.5">
                  <span>Description</span>
                  <span className="text-muted-foreground font-normal text-xs">{idea.length} chars</span>
                </label>
                <div className="relative">
                <Textarea id="idea" placeholder="Describe what you want to build..." value={idea} onChange={(e) => setIdea(e.target.value)} className="min-h-[200px]" />
                <div className="absolute top-2 right-2 z-10">
                  <MicButton onTranscript={(t) => setIdea((prev) => prev + " " + t)} />
                </div>
              </div>
              </div>
              {/* File Upload */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold mb-1.5">Requirement Files (optional)</label>
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                    isDragging ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50"
                  }`}
                >
                  <input ref={fileInputRef} type="file" multiple accept=".txt,.md,.pdf,.doc,.docx,.csv,.json,.xml,.yaml,.yml" onChange={handleFileSelect} className="hidden" />
                  <Upload className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">{isDragging ? "Drop files" : "Drag & drop or click"}</p>
                  <p className="text-xs text-muted-foreground mt-1">.txt, .md, .csv, .json, .xml, .yaml</p>
                </div>
                {uploadedFiles.length > 0 && (
                  <ul className="space-y-1 mt-2">
                    {uploadedFiles.map(({ file, id }) => (
                      <li key={id} className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-1.5 text-sm">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate">{file.name}</span>
                        <span className="text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
                        <button type="button" onClick={(e) => { e.stopPropagation(); removeFile(id); }} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
            <CardFooter className="border-t bg-muted/30 flex justify-end gap-3 p-4">
              <Button type="button" variant="ghost" onClick={() => setLocation("/dashboard")}>Cancel</Button>
              <Button type="submit" disabled={isPending} className="gap-2">
                {isPending ? "Creating..." : "Create Project"} <ArrowRight className="h-4 w-4" />
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}
    </div>
  );
}
