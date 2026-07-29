export interface DashboardStep {
  id: string;
  stage: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  durationMs: number | null;
  estimatedSeconds: number;
  agentKey: string;
  label: string;
}

export interface DocumentStats {
  sections: number;
  pages: number;
  diagrams: number;
  tables: number;
  wordCount: number;
}

export interface ProjectDashboard {
  projectId: string;
  status: string;
  currentStage: string | null;
  currentAgentKey: string | null;
  currentStep: string;
  currentStepProgress: number;
  percentComplete: number;
  completedAgents: number;
  totalAgents: number;
  etaSeconds: number;
  requirementCompleteness: number;
  aiConfidence: number;
  openQuestionCount: number;
  criticalIssueCount: number;
  tokenTotals: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  documentStats: DocumentStats;
  requirementCount: number;
  knowledgeItemCount: number;
  hasDocument: boolean;
  steps: DashboardStep[];
  recentExecutions: Array<{
    id: string;
    agentKey: string;
    status: string;
    model: string | null;
    inputTokens: number;
    outputTokens: number;
    error: string | null;
    startedAt: string | null;
    completedAt: string | null;
  }>;
  idea: string;
  projectName: string;
  updatedAt: string;
}

export interface AgentActivityPhase {
  phaseId: string;
  label: string;
  status: "pending" | "active" | "done";
}

export interface AgentActivityEvent {
  projectId: string;
  agentKey: string;
  phases: AgentActivityPhase[];
  activePhaseId: string | null;
}

export interface KnowledgeCreatedEvent {
  projectId: string;
  items: Array<{
    type: string;
    title: string;
    externalId?: string | null;
    source?: string | null;
  }>;
}
