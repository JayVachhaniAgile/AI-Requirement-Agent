import type { AgentValidationConfig } from './validation.types';

/**
 * Per-agent validation contracts. Field definitions mirror the finalized agent
 * system prompts (do not change prompt content — keep this table in sync with
 * the `externalId` prefixes, enum sets, and min/max bounds stated there).
 *
 * Agent keys match the workflow stage keys (e.g. `business-analysis`).
 */
export const AGENT_VALIDATION_CONFIGS: Record<string, AgentValidationConfig> = {
  discovery: {
    agentKey: 'discovery',
    requiredFields: {
      ideaInterpretation: 'string',
      problemStatement: 'string',
      proposedSolution: 'string',
      initialScope: 'string',
    },
    arrays: [
      { path: 'lowConfidenceFlags', min: 0, itemFields: { field: 'string', reason: 'string' } },
      {
        path: 'confirmedFacts',
        min: 0,
        max: 8,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'assumptions',
        min: 0,
        max: 8,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'businessGoals',
        min: 0,
        max: 6,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'userGoals',
        min: 0,
        max: 5,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'users',
        min: 0,
        max: 4,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'blockingQuestions',
        min: 0,
        max: 3,
        itemFields: { question: 'string', isBlocking: 'boolean' },
      },
      { path: 'riskFlags', min: 0, max: 5, itemFields: { title: 'string', description: 'string' } },
    ],
    idFields: [
      { path: 'confirmedFacts', prefix: 'FACT' },
      { path: 'assumptions', prefix: 'ASM' },
      { path: 'businessGoals', prefix: 'BG' },
      { path: 'userGoals', prefix: 'UG' },
      { path: 'users', prefix: 'USER' },
    ],
  },

  research: {
    agentKey: 'research',
    requiredFields: {
      marketOverview: 'string',
      competitorMatrix: 'string',
      researchSummary: 'string',
    },
    arrays: [
      { path: 'lowConfidenceFlags', min: 0, itemFields: { field: 'string', reason: 'string' } },
      {
        path: 'competitors',
        min: 0,
        max: 6,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'technologySuggestions',
        min: 0,
        max: 8,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'apiLandscape',
        min: 0,
        max: 5,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'complianceNotes',
        min: 0,
        max: 5,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'industryStandards',
        min: 0,
        max: 4,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'risks',
        min: 0,
        max: 5,
        itemFields: { title: 'string', description: 'string' },
      },
    ],
    idFields: [
      { path: 'competitors', prefix: 'COMP' },
      { path: 'technologySuggestions', prefix: 'TECH' },
      { path: 'apiLandscape', prefix: 'API' },
      { path: 'complianceNotes', prefix: 'COMPL' },
      { path: 'industryStandards', prefix: 'STD' },
      { path: 'risks', prefix: 'RRISK' },
    ],
  },

  'product-analysis': {
    agentKey: 'product-analysis',
    requiredFields: {
      productVision: 'string',
      valueProposition: 'string',
      mvpScope: 'string',
    },
    arrays: [
      { path: 'lowConfidenceFlags', min: 0, itemFields: { field: 'string', reason: 'string' } },
      {
        path: 'personas',
        min: 0,
        max: 4,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'modules',
        min: 0,
        max: 7,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'features',
        min: 0,
        max: 15,
        itemFields: {
          title: 'string',
          description: 'string',
          priority: 'string',
          module: 'string',
        },
      },
      {
        path: 'successMetrics',
        min: 0,
        max: 5,
        itemFields: { title: 'string', description: 'string' },
      },
    ],
    enums: [
      { path: 'features[].priority', values: ['MUST_HAVE', 'SHOULD_HAVE', 'COULD_HAVE', 'FUTURE'] },
    ],
    references: [{ path: 'features[].relatedBR', allowedPrefixes: ['BR'] }],
    idFields: [
      { path: 'personas', prefix: 'PER' },
      { path: 'modules', prefix: 'MOD' },
      { path: 'features', prefix: 'FEAT', requireIds: true },
    ],
  },

  'business-analysis': {
    agentKey: 'business-analysis',
    requiredFields: {
      businessProblem: 'string',
      scope: 'object',
    },
    arrays: [
      { path: 'lowConfidenceFlags', min: 0, itemFields: { field: 'string', reason: 'string' } },
      {
        path: 'businessObjectives',
        min: 0,
        max: 5,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'stakeholders',
        min: 0,
        max: 6,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'businessRequirements',
        min: 0,
        max: 10,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'businessRules',
        min: 0,
        max: 7,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'constraints',
        min: 0,
        max: 5,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'risks',
        min: 0,
        max: 6,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'assumptions',
        min: 0,
        max: 5,
        itemFields: { title: 'string', description: 'string' },
      },
    ],
    idFields: [
      { path: 'businessObjectives', prefix: 'BO' },
      { path: 'stakeholders', prefix: 'STK' },
      { path: 'businessRequirements', prefix: 'BR' },
      { path: 'businessRules', prefix: 'RULE' },
      { path: 'risks', prefix: 'RISK' },
      { path: 'assumptions', prefix: 'ASM-B' },
    ],
  },

  'requirements-engineering': {
    agentKey: 'requirements-engineering',
    arrays: [
      { path: 'lowConfidenceFlags', min: 0, itemFields: { field: 'string', reason: 'string' } },
     {
       path: 'functionalRequirements',
        min: 0,
        max: 20,
        itemFields: {
          title: 'string',
          module: 'string',
          actor: 'string',
          description: 'string',
          priority: 'string',
        },
      },
      {
        path: 'userStories',
        min: 0,
        max: 30,
        itemFields: {
          title: 'string',
          asA: 'string',
          iWant: 'string',
          soThat: 'string',
        },
      },
    ],
    enums: [
      {
        path: 'functionalRequirements[].priority',
        values: ['MUST_HAVE', 'SHOULD_HAVE', 'COULD_HAVE'],
      },
    ],
    references: [
      { path: 'functionalRequirements[].relatedBR', allowedPrefixes: ['BR'] },
      { path: 'functionalRequirements[].relatedFeature', allowedPrefixes: ['FEAT'] },
      { path: 'userStories[].relatedFR', allowedPrefixes: ['FR'] },
    ],
    idFields: [
      { path: 'functionalRequirements', prefix: 'FR' },
      { path: 'userStories', prefix: 'US' },
    ],
  },

  'ux-design': {
    agentKey: 'ux-design',
    requiredFields: {
      navigationFlow: 'string',
      uxSummary: 'string',
    },
    arrays: [
      { path: 'lowConfidenceFlags', min: 0, itemFields: { field: 'string', reason: 'string' } },
      {
        path: 'personas',
        min: 0,
        max: 4,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'userJourneys',
        min: 0,
        max: 6,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'screens',
        min: 0,
        max: 12,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'uxGuidelines',
        min: 0,
        max: 8,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'accessibility',
        min: 0,
        max: 6,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'wireframeDescriptions',
        min: 0,
        max: 8,
        itemFields: { title: 'string', description: 'string' },
      },
    ],
    idFields: [
      { path: 'personas', prefix: 'UXP' },
      { path: 'userJourneys', prefix: 'JOURNEY' },
      { path: 'screens', prefix: 'SCR' },
      { path: 'uxGuidelines', prefix: 'UXG' },
      { path: 'accessibility', prefix: 'A11Y' },
      { path: 'wireframeDescriptions', prefix: 'WF' },
    ],
  },

  'data-architecture': {
    agentKey: 'data-architecture',
    requiredFields: {
      erOverview: 'string',
      databaseSummary: 'string',
    },
    arrays: [
      { path: 'lowConfidenceFlags', min: 0, itemFields: { field: 'string', reason: 'string' } },
      {
        path: 'tables',
        min: 0,
        max: 12,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'relationships',
        min: 0,
        max: 10,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'constraints',
        min: 0,
        max: 8,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'indexes',
        min: 0,
        max: 8,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'dataDictionary',
        min: 0,
        max: 15,
        itemFields: { title: 'string', description: 'string' },
      },
    ],
    idFields: [
      { path: 'tables', prefix: 'TBL' },
      { path: 'relationships', prefix: 'REL' },
      { path: 'constraints', prefix: 'DCON' },
      { path: 'indexes', prefix: 'IDX' },
      { path: 'dataDictionary', prefix: 'DD' },
    ],
  },

  'ai-architecture': {
    agentKey: 'ai-architecture',
    requiredFields: {
      aiPipeline: 'string',
      aiArchitectureSummary: 'string',
    },
    arrays: [
      { path: 'lowConfidenceFlags', min: 0, itemFields: { field: 'string', reason: 'string' } },
      {
        path: 'llmSelection',
        min: 0,
        max: 4,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'promptStrategy',
        min: 0,
        max: 6,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'embeddings',
        min: 0,
        max: 4,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'vectorStore',
        min: 0,
        max: 3,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'memoryContext',
        min: 0,
        max: 4,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'guardrails',
        min: 0,
        max: 6,
        itemFields: { title: 'string', description: 'string' },
      },
    ],
    idFields: [
      { path: 'llmSelection', prefix: 'LLM' },
      { path: 'promptStrategy', prefix: 'PROMPT' },
      { path: 'embeddings', prefix: 'EMB' },
      { path: 'vectorStore', prefix: 'VEC' },
      { path: 'memoryContext', prefix: 'MEM' },
      { path: 'guardrails', prefix: 'GRD' },
    ],
  },

  'solution-architecture': {
    agentKey: 'solution-architecture',
    requiredFields: {
      systemArchitecture: 'string',
      technicalSummary: 'string',
    },
    arrays: [
      { path: 'lowConfidenceFlags', min: 0, itemFields: { field: 'string', reason: 'string' } },
      {
        path: 'components',
        min: 0,
        max: 10,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'apis',
        min: 0,
        max: 12,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'queuesEvents',
        min: 0,
        max: 6,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'infrastructure',
        min: 0,
        max: 6,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'deployment',
        min: 0,
        max: 5,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'loggingMonitoring',
        min: 0,
        max: 6,
        itemFields: { title: 'string', description: 'string' },
      },
    ],
    idFields: [
      { path: 'components', prefix: 'CMP' },
      { path: 'apis', prefix: 'API-SPEC' },
      { path: 'queuesEvents', prefix: 'EVT' },
      { path: 'infrastructure', prefix: 'INF' },
      { path: 'deployment', prefix: 'DEP' },
      { path: 'loggingMonitoring', prefix: 'OBS' },
    ],
  },

  'security-review': {
    agentKey: 'security-review',
    requiredFields: {
      securitySummary: 'string',
    },
    arrays: [
      { path: 'lowConfidenceFlags', min: 0, itemFields: { field: 'string', reason: 'string' } },
      {
        path: 'authnAuthz',
        min: 0,
        max: 6,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'owaspFindings',
        min: 0,
        max: 8,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'encryptionSecrets',
        min: 0,
        max: 5,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'apiSecurity',
        min: 0,
        max: 6,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'compliance',
        min: 0,
        max: 5,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'threatModel',
        min: 0,
        max: 6,
        itemFields: { title: 'string', description: 'string' },
      },
    ],
    enums: [{ path: 'riskRating', values: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] }],
    idFields: [
      { path: 'authnAuthz', prefix: 'SEC-AUTH' },
      { path: 'owaspFindings', prefix: 'OWASP' },
      { path: 'encryptionSecrets', prefix: 'SEC-ENC' },
      { path: 'apiSecurity', prefix: 'SEC-API' },
      { path: 'compliance', prefix: 'SEC-COMP' },
      { path: 'threatModel', prefix: 'THREAT' },
    ],
  },

  'qa-planning': {
    agentKey: 'qa-planning',
    requiredFields: {
      testStrategy: 'string',
      qaSummary: 'string',
    },
    arrays: [
      { path: 'lowConfidenceFlags', min: 0, itemFields: { field: 'string', reason: 'string' } },
      {
        path: 'testPlan',
        min: 0,
        max: 6,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'functionalTests',
        min: 0,
        max: 15,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'regressionTests',
        min: 0,
        max: 6,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'performanceTests',
        min: 0,
        max: 5,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'securityTests',
        min: 0,
        max: 6,
        itemFields: { title: 'string', description: 'string' },
      },
    ],
    idFields: [
      { path: 'testPlan', prefix: 'TP' },
      { path: 'functionalTests', prefix: 'TC' },
      { path: 'regressionTests', prefix: 'REG' },
      { path: 'performanceTests', prefix: 'PERF' },
      { path: 'securityTests', prefix: 'STEST' },
    ],
  },

  estimation: {
    agentKey: 'estimation',
    requiredFields: {
      complexityAssessment: 'string',
      estimationSummary: 'string',
      totalPersonWeeks: 'number',
    },
    arrays: [
      { path: 'lowConfidenceFlags', min: 0, itemFields: { field: 'string', reason: 'string' } },
      {
        path: 'teamComposition',
        min: 0,
        max: 6,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'timeline',
        min: 0,
        max: 6,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'costEstimate',
        min: 0,
        max: 5,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'sprintPlan',
        min: 0,
        max: 8,
        itemFields: { title: 'string', description: 'string' },
      },
      {
        path: 'estimationRisks',
        min: 0,
        max: 5,
        itemFields: { title: 'string', description: 'string' },
      },
    ],
    idFields: [
      { path: 'teamComposition', prefix: 'TEAM' },
      { path: 'timeline', prefix: 'TIME' },
      { path: 'costEstimate', prefix: 'COST' },
      { path: 'sprintPlan', prefix: 'SPRINT' },
      { path: 'estimationRisks', prefix: 'ERISK' },
    ],
  },

  validation: {
    agentKey: 'validation',
    requiredFields: {
      validationResult: 'string',
      summary: 'string',
    },
    arrays: [
      { path: 'lowConfidenceFlags', min: 0, itemFields: { field: 'string', reason: 'string' } },
      {
        path: 'issues',
        min: 0,
        max: 8,
        itemFields: {
          severity: 'string',
          category: 'string',
          sourceAgent: 'string',
          problem: 'string',
        },
      },
    ],
    enums: [
      { path: 'validationResult', values: ['PASS', 'CONDITIONAL_PASS', 'FAIL'] },
      { path: 'issues[].severity', values: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
    ],
    references: [{ path: 'issues[].affectedIds' }],
    idFields: [{ path: 'issues', prefix: 'VAL' }],
    scoreRanges: [{ path: 'scores', min: 0, max: 10 }],
    summaryFields: ['summary'],
  },

  debate: {
    agentKey: 'debate',
    requiredFields: {
      debateSummary: 'string',
      overallReadiness: 'string',
    },
    arrays: [
      { path: 'lowConfidenceFlags', min: 0, itemFields: { field: 'string', reason: 'string' } },
      {
        path: 'contradictions',
        min: 0,
        max: 20,
        itemFields: { impact: 'string' },
      },
      {
        path: 'assumptionsToValidate',
        min: 0,
        max: 20,
        itemFields: {
          sourceField: 'string',
          description: 'string',
          riskLevel: 'string',
        },
      },
      {
        path: 'debateTranscript',
        min: 0,
        max: 10,
        itemFields: { perspective: 'string', position: 'string', counterpoint: 'string' },
      },
    ],
    enums: [
      { path: 'assumptionsToValidate[].riskLevel', values: ['LOW', 'MEDIUM', 'HIGH'] },
      { path: 'overallReadiness', values: ['LOW', 'MEDIUM', 'HIGH'] },
    ],
    references: [{ path: 'contradictions[].conflictingItems' }],
    idFields: [
      { path: 'contradictions', prefix: 'CONTRA' },
      { path: 'assumptionsToValidate', prefix: 'VAL' },
    ],
    summaryFields: ['debateSummary'],
  },

  'gap-analysis': {
    agentKey: 'gap-analysis',
    requiredFields: {
      coveragePct: 'number',
      qualityScore: 'number',
      totalGaps: 'number',
      resolvedGaps: 'number',
      remainingGaps: 'number',
      stopAfterThisIteration: 'boolean',
      summary: 'string',
    },
    arrays: [
      { path: 'lowConfidenceFlags', min: 0, itemFields: { field: 'string', reason: 'string' } },
      {
        path: 'findings',
        min: 0,
        itemFields: { document: 'string', action: 'string', finding: 'string', severity: 'string' },
      },
    ],
    enums: [
      { path: 'findings[].action', values: ['KEEP', 'UPDATE', 'APPEND', 'DEPRECATE'] },
      { path: 'findings[].severity', values: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
    ],
    numberRanges: [
      { path: 'coveragePct', min: 0, max: 100 },
      { path: 'qualityScore', min: 0, max: 100 },
      { path: 'findings[].confidence', min: 0, max: 100 },
    ],
    summaryFields: ['summary'],
  },

  'gap-patch': {
    agentKey: 'gap-patch',
    requiredFields: {
      mode: 'string',
      newContent: 'string',
    },
    enums: [{ path: 'mode', values: ['REPLACE', 'APPEND'] }],
    summaryFields: [],
  },
};
