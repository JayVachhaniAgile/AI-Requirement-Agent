import { apiJson } from '@/lib/api-fetch';

export interface AggValidationIssue {
  id: string;
  projectId: string;
  projectName: string;
  externalId: string | null;
  severity: string;
  category: string;
  sourceAgent: string | null;
  affectedIds: string[] | null;
  problem: string;
  evidence: string | null;
  impact: string | null;
  recommendedCorrection: string | null;
  responsibleAgent: string | null;
  requiresHumanDecision: boolean;
  status: string;
  createdAt: string;
}

export interface DocStats {
  sections: number;
  pages: number;
  diagrams: number;
  tables: number;
  wordCount: number;
}

export interface AggDocument {
  id: string;
  projectId: string;
  projectName: string;
  status: string;
  validationScore: string | null;
  createdAt: string;
  updatedAt: string;
  stats: DocStats;
  confidence: number | null;
}

export interface AnalyticsData {
  totalProjects: number;
  completedProjects: number;
  runningProjects: number;
  failedProjects: number;
  totalExecutions: number;
  tokenTotals: { inputTokens: number; outputTokens: number; totalTokens: number };
  totalRequirements: number;
  validatedRequirements: number;
  totalIssues: number;
  criticalIssues: number;
  openIssues: number;
  agentStats: Array<{ agentKey: string; executions: number; avgDurationMs: number; successRate: number; failures: number }>;
  pipelineStats: Record<string, { completed: number; failed: number; running: number; total: number }>;
}

export interface WorkflowOverview {
  projectSummaries: Array<{
    id: string; name: string; status: string; currentStage: string | null;
    completedSteps: number; totalSteps: number; percentComplete: number; lastActivity: string;
  }>;
  agentRunHistory: Array<{
    id: string; projectId: string; agentKey: string | null;
    status: string; model: string | null;
    inputTokens: number | null; outputTokens: number | null;
    startedAt: string | null; completedAt: string | null;
  }>;
}

export function fetchAllValidation() { return apiJson<AggValidationIssue[]>('/api/aggregate/validation'); }
export function fetchAllDocuments() { return apiJson<AggDocument[]>('/api/aggregate/documents'); }
export function fetchAnalytics() { return apiJson<AnalyticsData>('/api/aggregate/analytics'); }
export function fetchWorkflowOverview() { return apiJson<WorkflowOverview>('/api/aggregate/workflow'); }

export function fetchPipelineDefaults(): Promise<Record<string, string>> {
  return apiJson<Record<string, string>>('/api/settings/pipeline');
}

export function savePipelineDefaults(values: Record<string, string>): Promise<Record<string, string>> {
  return apiJson<Record<string, string>>('/api/settings/pipeline', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  });
}
