import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useCreateProject, useUploadProjectFiles } from "@workspace/api-client-react";
import { ArrowRight, Upload, FileText, X, Terminal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface UploadedFile {
  file: File;
  id: string;
}

export default function NewProjectPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createProject = useCreateProject();
  const uploadProjectFilesMutation = useUploadProjectFiles();

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
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    // Reset so the same file can be re-selected
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
      toast({
        title: "Validation Error",
        description: "Please provide a project name.",
        variant: "destructive",
      });
      return;
    }

    const hasManualIdea = idea.trim().length > 0;
    const hasFiles = uploadedFiles.length > 0;

    if (!hasManualIdea && !hasFiles) {
      toast({
        title: "Validation Error",
        description: "Please describe your idea or upload requirement files.",
        variant: "destructive",
      });
      return;
    }

    if (hasFiles) {
      // Upload with files via the generated mutation
      uploadProjectFilesMutation.mutate(
        {
          name: name.trim(),
          files: uploadedFiles.map((f) => f.file),
          idea: hasManualIdea ? idea.trim() : undefined,
        },
        {
          onSuccess: (project) => {
            toast({
              title: "Project Initialized",
              description: "Requirements files uploaded. Agents are ready for analysis.",
            });
            setLocation(`/projects/${project.id}`);
          },
          onError: (err: any) => {
            toast({
              title: "Upload Failed",
              description: err.message || "Failed to create project with files",
              variant: "destructive",
            });
          },
        }
      );
    } else {
      // Manual entry only — use the existing generated mutation
      mutationFnRef.current(
        { data: { name: name.trim(), idea: idea.trim() } },
        {
          onSuccess: (project) => {
            toast({
              title: "Project Initialized",
              description: "Agents are ready for analysis.",
            });
            setLocation(`/projects/${project.id}`);
          },
          onError: (err: any) => {
            toast({
              title: "Initialization Failed",
              description: err.message || "Failed to create project",
              variant: "destructive",
            });
          },
        }
      );
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight uppercase">New Analysis</h1>
        <p className="text-muted-foreground font-mono text-sm mt-1">
          Submit a high-level concept for autonomous processing
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>System Inputs</CardTitle>
            <CardDescription>
              Provide the foundational parameters. You can describe your idea manually,
              upload requirement documents, or both. The multi-agent system will discover
              edge cases and missing constraints.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-bold uppercase tracking-wider">
                Project Designation
              </label>
              <Input
                id="name"
                placeholder="e.g. Acme Inventory Tracker"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="idea" className="text-sm font-bold uppercase tracking-wider flex justify-between">
                <span>Core Idea Directive</span>
                <span className="text-muted-foreground font-normal normal-case font-mono">{idea.length} chars</span>
              </label>
              <Textarea
                id="idea"
                placeholder="Describe the software you want to build. What is its main purpose? Who will use it? What are the key features?"
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                className="min-h-[200px] font-mono leading-relaxed"
              />
            </div>

            {/* File Upload Area */}
            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-wider">
                <span>Requirement Files</span>
                <span className="text-muted-foreground font-normal normal-case font-mono ml-2">
                  {uploadedFiles.length > 0 ? `(${uploadedFiles.length} file(s) attached)` : "(optional)"}
                </span>
              </label>

              {/* Drop zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                  ${isDragging
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/50"
                  }
                `}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".txt,.md,.pdf,.doc,.docx,.csv,.json,.xml,.yaml,.yml"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm font-medium">
                  {isDragging ? "Drop files here" : "Drag & drop files or click to browse"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supports .txt, .md, .pdf, .doc, .csv, .json, .xml, .yaml
                </p>
              </div>

              {/* File list */}
              {uploadedFiles.length > 0 && (
                <ul className="space-y-2 mt-3">
                  {uploadedFiles.map(({ file, id }) => (
                    <li
                      key={id}
                      className="flex items-center gap-3 bg-muted/40 rounded-md px-3 py-2 text-sm"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate font-mono">{file.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatFileSize(file.size)}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(id);
                        }}
                        className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
          <CardFooter className="bg-muted/40 border-t border-border pt-6">
            <div className="flex justify-end w-full space-x-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setLocation("/dashboard")}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="gap-2"
              >
                {isPending ? "Initializing..." : "Start Analysis"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
