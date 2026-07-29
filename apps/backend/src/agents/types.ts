export interface AgentContext {
  projectId: string;
  projectName: string;
  idea: string;
  knowledgeItems: KnowledgeItemSummary[];
  answeredQuestions: AnsweredQuestion[];
}

export interface KnowledgeItemSummary {
  externalId: string | null;
  type: string;
  title: string;
  description: string | null;
  status: string;
}

export interface AnsweredQuestion {
  question: string;
  answer: string;
}

export interface NewKnowledgeItem {
  externalId?: string;
  type: string;
  title: string;
  description?: string;
  status: string;
  relatedIds?: string[];
}

export interface NewQuestion {
  question: string;
  context?: string;
  isBlocking: boolean;
}

export interface NewValidationIssue {
  externalId?: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
  sourceAgent?: string;
  affectedIds?: string[];
  problem: string;
  evidence?: string;
  impact?: string;
  recommendedCorrection?: string;
  responsibleAgent?: string;
  requiresHumanDecision?: boolean;
}

export interface AgentTokens {
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface AgentResult {
  success: boolean;
  agentKey: string;
  knowledgeItems: NewKnowledgeItem[];
  questions: NewQuestion[];
  validationIssues?: NewValidationIssue[];
  documentContent?: string;
  warnings: string[];
  _tokens?: AgentTokens;
}
