/**
 * API client for the foundation architecture (Phases 1–9):
 * canonical model, context engine, quality engine, compiler, skills,
 * migration, orchestration.
 */

import { apiJson } from "@/lib/api-fetch";

function request<T>(path: string, init?: RequestInit): Promise<T> {
  return apiJson<T>(`/api/foundation${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

// ---------------------------------------------------------------------------
// Canonical model (Phase 2)
// ---------------------------------------------------------------------------

export interface CanonicalItem {
  id: string;
  projectId: string;
  kind: string;
  externalId: string;
  title: string;
  summary?: string | null;
  status: string;
  version: number;
  confidence?: number | null;
  payload: Record<string, unknown>;
  provenance: {
    epistemicClass?: string;
    sources?: Array<{ category: string; refId?: string; label?: string }>;
    producedBy?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export function getCanonicalItemsQueryKey(projectId: string, kind?: string) {
  return ["foundation", "canonical", projectId, kind ?? "all"] as const;
}

export async function fetchCanonicalItems(projectId: string, kind?: string): Promise<CanonicalItem[]> {
  const qs = kind ? `?kind=${encodeURIComponent(kind)}` : "";
  return request<CanonicalItem[]>(`/canonical/projects/${projectId}/items${qs}`);
}

export async function fetchCanonicalKinds(): Promise<{ kinds: string[] }> {
  return request<{ kinds: string[] }>("/canonical/kinds");
}

// ---------------------------------------------------------------------------
// Context engine (Phase 3)
// ---------------------------------------------------------------------------

export interface ContextPackage {
  projectId: string;
  agentSkill: string;
  taskType: string;
  projectSummary: string;
  relevantArtifacts: Array<{ source: { externalId: string; kind: string }; title: string; summary?: string; confidence?: number; score: number }>;
  relevantEvidence: Array<{ text: string; score: number }>;
  dependencies: Array<{ title: string; summary?: string }>;
  decisions: unknown[];
  assumptions: unknown[];
  openQuestions: unknown[];
  tokenEstimate: number;
  sourceReferences: Array<{ externalId: string; kind: string }>;
  cached: boolean;
  cacheKey: string;
  warnings: string[];
  generatedAt: string;
}

export async function compileContext(projectId: string, body: Record<string, unknown>): Promise<ContextPackage> {
  return request<ContextPackage>(`/context/projects/${projectId}/compile`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Quality engine (Phase 8)
// ---------------------------------------------------------------------------

export interface QualityResult {
  status: "PASS" | "WARNING" | "REVIEW_REQUIRED" | "BLOCKED";
  score: number;
  checks: Array<{ key: string; status: string; score: number; weight: number; issues: unknown[] }>;
  issues: Array<{ check: string; severity: string; message: string }>;
  warnings: string[];
  blockingIssues: string[];
  recommendations: string[];
  evaluatedAt: string;
  evaluatorVersion: string;
}

export interface ProjectEvaluation {
  projectId: string;
  results: Array<{ artifact: { id: string; kind: string; title: string; confidence?: number | null }; result: QualityResult }>;
  coverage: { key: string; status: string; score: number; issues: unknown[] };
  summary: { total: number; passed: number; warnings: number; reviewRequired: number; blocked: number; averageScore: number };
}

export function getProjectEvaluationQueryKey(projectId: string) {
  return ["foundation", "quality", projectId] as const;
}

export async function evaluateProject(projectId: string): Promise<ProjectEvaluation> {
  return request<ProjectEvaluation>(`/quality/engine/projects/${projectId}/evaluate`, { method: "POST" });
}

// ---------------------------------------------------------------------------
// Artifact compiler (Phase 9)
// ---------------------------------------------------------------------------

export interface CompiledDocument {
  documentType: string;
  persistedDocumentType: string;
  markdown: string;
  warnings: Array<{ type: string; message: string; artifactKey?: string }>;
  missingRequiredKinds: string[];
  sourceArtifactCount: number;
  compilerVersion: string;
  templateVersion: string;
  generatedAt: string;
}

export interface CompilerTypes {
  documentTypes: string[];
  requiredKinds: Record<string, string[]>;
  persistedDocumentTypes: Record<string, string>;
}

export async function fetchCompilerTypes(): Promise<CompilerTypes> {
  return request<CompilerTypes>("/compiler/types");
}

export async function compileDocument(projectId: string, documentType: string, opts: { refine?: boolean; source?: string } = {}): Promise<CompiledDocument> {
  return request<CompiledDocument>(`/compiler/projects/${projectId}/compile`, {
    method: "POST",
    body: JSON.stringify({ documentType, refine: opts.refine, source: opts.source }),
  });
}

export async function dryRunDocument(projectId: string, documentType: string, source?: string): Promise<CompiledDocument> {
  return request<CompiledDocument>(`/compiler/projects/${projectId}/dry-run`, {
    method: "POST",
    body: JSON.stringify({ documentType, source }),
  });
}

// ---------------------------------------------------------------------------
// Skills + migration (Phases 5–6)
// ---------------------------------------------------------------------------

export interface MigrationStatus {
  agents: Array<{ agentKey: string; batch: number | null; mode: string; enabled: boolean }>;
  thresholds: Record<string, unknown>;
}

export async function fetchMigrationStatus(): Promise<MigrationStatus> {
  return request<MigrationStatus>("/migration/status");
}

export interface MigrationComparison {
  id: string;
  projectId: string;
  agentKey: string;
  batch: number | null;
  mode: string;
  createdAt: string;
  verdict: { canMigrate: boolean; blockers: string[] };
}

export function getMigrationComparisonsQueryKey(projectId: string) {
  return ["foundation", "migration", projectId] as const;
}

export async function fetchMigrationComparisons(projectId: string): Promise<MigrationComparison[]> {
  return request<MigrationComparison[]>(`/migration/comparisons?projectId=${encodeURIComponent(projectId)}`);
}

// ---------------------------------------------------------------------------
// Orchestration (Phase 7)
// ---------------------------------------------------------------------------

export interface OrchestrationPlanEntity {
  id: string;
  projectId: string;
  requestedOutcome: string;
  plan: {
    levels: string[][];
    checkpoints: Record<string, string>;
    skipped: string[];
  };
  status: string;
  currentLevel: number;
  error: string | null;
  createdAt: string;
}

export async function createOrchestrationPlan(projectId: string, requestedOutcome: string, signals?: Record<string, boolean>): Promise<OrchestrationPlanEntity> {
  return request<OrchestrationPlanEntity>("/orchestration/plans", {
    method: "POST",
    body: JSON.stringify({ projectId, requestedOutcome, signals: signals ?? {} }),
  });
}

export async function runOrchestrationPlan(planId: string): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`/orchestration/plans/${planId}/run`, { method: "POST" });
}

export async function fetchOrchestrationPlans(projectId: string): Promise<OrchestrationPlanEntity[]> {
  return request<OrchestrationPlanEntity[]>(`/orchestration/projects/${projectId}/plans`);
}

export async function fetchOrchestrationPlan(planId: string): Promise<{ plan: OrchestrationPlanEntity; nodes: unknown[] }> {
  return request<{ plan: OrchestrationPlanEntity; nodes: unknown[] }>(`/orchestration/plans/${planId}`);
}
