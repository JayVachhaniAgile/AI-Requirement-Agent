/** A `conflicts_with` pair surfaced from the relationship graph. */
export interface KnowledgeConflict {
  sourceId: string;
  sourceTitle: string;
  sourceDomain: string;
  targetId: string;
  targetTitle: string;
  targetDomain: string;
  relation: string;
  reason?: string | null;
}

export interface AgentContext {
  projectId: string;
  projectName: string;
  idea: string;
  knowledgeItems: KnowledgeItemSummary[];
  answeredQuestions: AnsweredQuestion[];
  domain?: string;
  /** `conflicts_with` pairs from the knowledge graph (validation/debate). */
  conflicts?: KnowledgeConflict[];
  domainInfo?: {
    domain: string;
    standards: string[];
    regulations: string[];
    bestPractices: string[];
  };
}

export interface KnowledgeItemSummary {
  externalId: string | null;
  type: string;
  title: string;
  description: string | null;
  status: string;
  /** Producing agent key (workflow naming), when known. */
  source?: string | null;
  /** Source category — prompt, document, research, ai_analysis, user_input */
  sourceCategory?: string;
}

export interface AnsweredQuestion {
  question: string;
  answer: string;
}

export interface NewKnowledgeItem {
  externalId?: string;
  type: string;
  title: string;
  description?: string | null;
  status: string;
  relatedIds?: string[];
  /** Source attribution — where this requirement came from */
  sourceCategory?: string;
  /** Evidence text — excerpts, references, or reasoning that supports this item */
  evidence?: string | null;
  /** AI reasoning trace for debate/transparency */
  reasoning?: string | null;
  /** Confidence score 0-100 */
  confidence?: number;
}

export interface NewQuestion {
  question: string;
  context?: string | null;
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

export interface DiscoveryCheckpointData {
  ideaInterpretation: string;
  problemStatement: string;
  proposedSolution: string;
  initialScope: string;
  blockingQuestions: Array<{
    question: string;
    context?: string | null;
    isBlocking: boolean;
  }>;
}

export interface AgentTokens {
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface AgentDebateEntry {
  agentKey: string;
  position: string;
  reasoning: string;
  alternatives?: string[];
  vote?: 'approve' | 'challenge' | 'abstain';
  critique?: string;
}

export interface AgentResult {
  success: boolean;
  agentKey: string;
  knowledgeItems: NewKnowledgeItem[];
  questions: NewQuestion[];
  /** Discovery only: structured interpretation surfaced at the P0-4 checkpoint. */
  discoveryCheckpoint?: DiscoveryCheckpointData;
  validationIssues?: NewValidationIssue[];
  documentContent?: string;
  warnings: string[];
  /** Debate traces — reasoning that can be shown to users */
  reasoningTraces?: string[];
  /** Alternatives considered by this agent */
  alternativesConsidered?: string[];
  _tokens?: AgentTokens;
}
