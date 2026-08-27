/**
 * Per-agent JSON schemas for forced structured output (P0-1).
 *
 * Each schema matches the field definitions already stated in the finalized
 * agent system prompts. The LLM API layer is configured to force a single
 * tool call whose input schema is this definition, so the returned payload
 * never requires markdown-fence stripping or prose trimming.
 */

export interface AgentStructuredSchema {
  /** Tool the model is forced to call, e.g. `submit_discovery_output`. */
  toolName: string;
  /** JSON Schema (draft 2020-12 subset accepted by OpenAI/Groq). */
  schema: Record<string, unknown>;
}

const STRING = { type: 'string' } as const;
const NUMBER = { type: 'number' } as const;
const BOOLEAN = { type: 'boolean' } as const;
const STRING_ARRAY = { type: 'array', items: STRING } as const;

function itemShape(
  extraProps: Record<string, unknown> = {},
  required: string[] = ['externalId', 'title', 'description'],
): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      externalId: STRING,
      title: STRING,
      description: STRING,
      ...extraProps,
    },
    required,
  };
}

function arrayOf(
  items: Record<string, unknown>,
  minItems?: number,
  maxItems?: number,
): Record<string, unknown> {
  return {
    type: 'array',
    items,
    ...(minItems !== undefined ? { minItems } : {}),
    ...(maxItems !== undefined ? { maxItems } : {}),
  };
}

const evidenceReasoning = {
  evidence: STRING,
  reasoning: STRING,
};

export const AGENT_STRUCTURED_SCHEMAS: Record<string, AgentStructuredSchema> = {
  discovery: {
    toolName: 'submit_discovery_output',
    schema: {
      type: 'object',
      properties: {
        lowConfidenceFlags: arrayOf({
          type: 'object',
          properties: { field: STRING, reason: STRING },
          required: ['field', 'reason'],
        }),
        ideaInterpretation: STRING,
        problemStatement: STRING,
        proposedSolution: STRING,
        confirmedFacts: arrayOf(
          itemShape(evidenceReasoning, [
            'externalId',
            'title',
            'description',
            'evidence',
            'reasoning',
          ]),
          0,
          8,
        ),
        assumptions: arrayOf(
          itemShape({ reasoning: STRING }, ['externalId', 'title', 'description', 'reasoning']),
          0,
          8,
        ),
        businessGoals: arrayOf(
          itemShape({ evidence: STRING }, ['externalId', 'title', 'description', 'evidence']),
          0,
          6,
        ),
        userGoals: arrayOf(itemShape(), undefined, 5),
        users: arrayOf(itemShape(), 0, 4),
        blockingQuestions: arrayOf(
          {
            type: 'object',
            properties: { question: STRING, context: STRING, isBlocking: BOOLEAN },
            required: ['question', 'isBlocking'],
          },
          0,
          3,
        ),
        riskFlags: arrayOf(
          {
            type: 'object',
            properties: { title: STRING, description: STRING },
            required: ['title', 'description'],
          },
          0,
          5,
        ),
        initialScope: STRING,
        reasoningTraces: STRING_ARRAY,
        alternativesConsidered: STRING_ARRAY,
      },
      required: [
        'lowConfidenceFlags',
        'ideaInterpretation',
        'problemStatement',
        'proposedSolution',
        'confirmedFacts',
        'assumptions',
        'businessGoals',
        'userGoals',
        'users',
        'blockingQuestions',
        'riskFlags',
        'initialScope',
      ],
    },
  },

  research: {
    toolName: 'submit_research_output',
    schema: {
      type: 'object',
      properties: {
        lowConfidenceFlags: arrayOf({
          type: 'object',
          properties: { field: STRING, reason: STRING },
          required: ['field', 'reason'],
        }),
        marketOverview: STRING,
        competitors: arrayOf(
          itemShape(evidenceReasoning, [
            'externalId',
            'title',
            'description',
            'evidence',
            'reasoning',
          ]),
          0,
          6,
        ),
        competitorMatrix: STRING,
        technologySuggestions: arrayOf(
          itemShape(evidenceReasoning, [
            'externalId',
            'title',
            'description',
            'evidence',
            'reasoning',
          ]),
          0,
          8,
        ),
        apiLandscape: arrayOf(itemShape(), 0, 5),
        complianceNotes: arrayOf(itemShape(), 0, 5),
        industryStandards: arrayOf(itemShape(), 0, 4),
        risks: arrayOf(itemShape(), 0, 5),
        researchSummary: STRING,
      },
      required: [
        'lowConfidenceFlags',
        'marketOverview',
        'competitors',
        'competitorMatrix',
        'technologySuggestions',
        'apiLandscape',
        'complianceNotes',
        'industryStandards',
        'risks',
        'researchSummary',
      ],
    },
  },

  'product-analysis': {
    toolName: 'submit_product_analysis_output',
    schema: {
      type: 'object',
      properties: {
        lowConfidenceFlags: arrayOf({
          type: 'object',
          properties: { field: STRING, reason: STRING },
          required: ['field', 'reason'],
        }),
        productVision: STRING,
        valueProposition: STRING,
        personas: arrayOf(itemShape(), 0, 4),
        modules: arrayOf(itemShape(), 0, 7),
        features: arrayOf(
          itemShape(
            {
              priority: {
                type: 'string',
                enum: ['MUST_HAVE', 'SHOULD_HAVE', 'COULD_HAVE', 'FUTURE'],
              },
              module: STRING,
              relatedBR: STRING,
            },
            ['externalId', 'title', 'description', 'priority', 'module'],
          ),
          0,
          15,
        ),
        mvpScope: STRING,
        successMetrics: arrayOf(
          {
            type: 'object',
            properties: { title: STRING, description: STRING },
            required: ['title', 'description'],
          },
          0,
          5,
        ),
      },
      required: [
        'lowConfidenceFlags',
        'productVision',
        'valueProposition',
        'personas',
        'modules',
        'features',
        'mvpScope',
        'successMetrics',
      ],
    },
  },

  'business-analysis': {
    toolName: 'submit_business_analysis_output',
    schema: {
      type: 'object',
      properties: {
        lowConfidenceFlags: arrayOf({
          type: 'object',
          properties: { field: STRING, reason: STRING },
          required: ['field', 'reason'],
        }),
        businessProblem: STRING,
        businessObjectives: arrayOf(itemShape(), 0, 5),
        stakeholders: arrayOf(itemShape(), 0, 6),
        businessRequirements: arrayOf(itemShape(), 0, 10),
        businessRules: arrayOf(itemShape(), 0, 7),
        constraints: arrayOf(
          {
            type: 'object',
            properties: { title: STRING, description: STRING },
            required: ['title', 'description'],
          },
          0,
          5,
        ),
        risks: arrayOf(itemShape(), 0, 6),
        assumptions: arrayOf(itemShape(), 0, 5),
        scope: {
          type: 'object',
          properties: {
            inScope: STRING_ARRAY,
            outOfScope: STRING_ARRAY,
          },
          required: ['inScope', 'outOfScope'],
        },
      },
      required: [
        'lowConfidenceFlags',
        'businessProblem',
        'businessObjectives',
        'stakeholders',
        'businessRequirements',
        'businessRules',
        'constraints',
        'risks',
        'assumptions',
        'scope',
      ],
    },
  },

  'requirements-engineering': {
    toolName: 'submit_requirements_engineering_output',
    schema: {
      type: 'object',
      properties: {
        lowConfidenceFlags: arrayOf({
          type: 'object',
          properties: { field: STRING, reason: STRING },
          required: ['field', 'reason'],
        }),
        functionalRequirements: arrayOf(
          itemShape(
            {
              module: STRING,
              actor: STRING,
              priority: { type: 'string', enum: ['MUST_HAVE', 'SHOULD_HAVE', 'COULD_HAVE'] },
              relatedBR: STRING,
              relatedFeature: STRING,
              acceptanceCriteria: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { id: STRING, given: STRING, when: STRING, then: STRING },
                  required: ['id', 'given', 'when', 'then'],
                },
              },
              validationRules: STRING_ARRAY,
              errorConditions: STRING_ARRAY,
              evidence: STRING,
              reasoning: STRING,
            },
            [
              'externalId',
              'title',
              'module',
              'actor',
              'description',
              'priority',
              'acceptanceCriteria',
            ],
          ),
          0,
          20,
        ),
        userStories: arrayOf(
          itemShape(
            {
              asA: STRING,
              iWant: STRING,
              soThat: STRING,
              relatedFR: STRING,
              evidence: STRING,
              reasoning: STRING,
            },
            ['externalId', 'title', 'asA', 'iWant', 'soThat'],
          ),
        ),
      },
      required: ['functionalRequirements', 'userStories'],
    },
  },

  'ux-design': {
    toolName: 'submit_ux_design_output',
    schema: {
      type: 'object',
      properties: {
        lowConfidenceFlags: arrayOf({
          type: 'object',
          properties: { field: STRING, reason: STRING },
          required: ['field', 'reason'],
        }),
        personas: arrayOf(itemShape(), 0, 4),
        userJourneys: arrayOf(itemShape(), 0, 6),
        screens: arrayOf(itemShape(), 0, 12),
        navigationFlow: STRING,
        uxGuidelines: arrayOf(itemShape(), 0, 8),
        accessibility: arrayOf(itemShape(), 0, 6),
        wireframeDescriptions: arrayOf(itemShape(), 0, 8),
        uxSummary: STRING,
      },
      required: [
        'lowConfidenceFlags',
        'personas',
        'userJourneys',
        'screens',
        'navigationFlow',
        'uxGuidelines',
        'accessibility',
        'wireframeDescriptions',
        'uxSummary',
      ],
    },
  },

  'data-architecture': {
    toolName: 'submit_data_architecture_output',
    schema: {
      type: 'object',
      properties: {
        lowConfidenceFlags: arrayOf({
          type: 'object',
          properties: { field: STRING, reason: STRING },
          required: ['field', 'reason'],
        }),
        erOverview: STRING,
        tables: arrayOf(itemShape(), 0, 12),
        relationships: arrayOf(itemShape(), 0, 10),
        constraints: arrayOf(itemShape(), 0, 8),
        indexes: arrayOf(itemShape(), 0, 8),
        dataDictionary: arrayOf(itemShape(), 0, 15),
        databaseSummary: STRING,
      },
      required: [
        'lowConfidenceFlags',
        'erOverview',
        'tables',
        'relationships',
        'constraints',
        'indexes',
        'dataDictionary',
        'databaseSummary',
      ],
    },
  },

  'ai-architecture': {
    toolName: 'submit_ai_architecture_output',
    schema: {
      type: 'object',
      properties: {
        lowConfidenceFlags: arrayOf({
          type: 'object',
          properties: { field: STRING, reason: STRING },
          required: ['field', 'reason'],
        }),
        aiPipeline: STRING,
        llmSelection: arrayOf(itemShape(), 0, 4),
        promptStrategy: arrayOf(itemShape(), 0, 6),
        embeddings: arrayOf(itemShape(), 0, 4),
        vectorStore: arrayOf(itemShape(), 0, 3),
        memoryContext: arrayOf(itemShape(), 0, 4),
        guardrails: arrayOf(itemShape(), 0, 6),
        aiArchitectureSummary: STRING,
      },
      required: [
        'lowConfidenceFlags',
        'aiPipeline',
        'llmSelection',
        'promptStrategy',
        'embeddings',
        'vectorStore',
        'memoryContext',
        'guardrails',
        'aiArchitectureSummary',
      ],
    },
  },

  'solution-architecture': {
    toolName: 'submit_solution_architecture_output',
    schema: {
      type: 'object',
      properties: {
        lowConfidenceFlags: arrayOf({
          type: 'object',
          properties: { field: STRING, reason: STRING },
          required: ['field', 'reason'],
        }),
        systemArchitecture: STRING,
        components: arrayOf(itemShape(), 0, 10),
        apis: arrayOf(itemShape(), 0, 12),
        queuesEvents: arrayOf(itemShape(), 0, 6),
        infrastructure: arrayOf(itemShape(), 0, 6),
        deployment: arrayOf(itemShape(), 0, 5),
        loggingMonitoring: arrayOf(itemShape(), 0, 6),
        technicalSummary: STRING,
      },
      required: [
        'lowConfidenceFlags',
        'systemArchitecture',
        'components',
        'apis',
        'queuesEvents',
        'infrastructure',
        'deployment',
        'loggingMonitoring',
        'technicalSummary',
      ],
    },
  },

  'security-review': {
    toolName: 'submit_security_review_output',
    schema: {
      type: 'object',
      properties: {
        lowConfidenceFlags: arrayOf({
          type: 'object',
          properties: { field: STRING, reason: STRING },
          required: ['field', 'reason'],
        }),
        authnAuthz: arrayOf(itemShape(), 0, 6),
        owaspFindings: arrayOf(itemShape(), 0, 8),
        encryptionSecrets: arrayOf(itemShape(), 0, 5),
        apiSecurity: arrayOf(itemShape(), 0, 6),
        compliance: arrayOf(itemShape(), 0, 5),
        threatModel: arrayOf(itemShape(), 0, 6),
        securitySummary: STRING,
        riskRating: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
      },
      required: [
        'lowConfidenceFlags',
        'authnAuthz',
        'owaspFindings',
        'encryptionSecrets',
        'apiSecurity',
        'compliance',
        'threatModel',
        'securitySummary',
        'riskRating',
      ],
    },
  },

  'qa-planning': {
    toolName: 'submit_qa_planning_output',
    schema: {
      type: 'object',
      properties: {
        lowConfidenceFlags: arrayOf({
          type: 'object',
          properties: { field: STRING, reason: STRING },
          required: ['field', 'reason'],
        }),
        testStrategy: STRING,
        testPlan: arrayOf(itemShape(), 0, 6),
        functionalTests: arrayOf(itemShape(), 0, 15),
        regressionTests: arrayOf(itemShape(), 0, 6),
        performanceTests: arrayOf(itemShape(), 0, 5),
        securityTests: arrayOf(itemShape(), 0, 6),
        qaSummary: STRING,
      },
      required: [
        'lowConfidenceFlags',
        'testStrategy',
        'testPlan',
        'functionalTests',
        'regressionTests',
        'performanceTests',
        'securityTests',
        'qaSummary',
      ],
    },
  },

  estimation: {
    toolName: 'submit_estimation_output',
    schema: {
      type: 'object',
      properties: {
        lowConfidenceFlags: arrayOf({
          type: 'object',
          properties: { field: STRING, reason: STRING },
          required: ['field', 'reason'],
        }),
        complexityAssessment: STRING,
        teamComposition: arrayOf(itemShape(), 0, 6),
        timeline: arrayOf(itemShape(), 0, 6),
        costEstimate: arrayOf(itemShape(), 0, 5),
        sprintPlan: arrayOf(itemShape(), 0, 8),
        estimationRisks: arrayOf(itemShape(), 0, 5),
        estimationSummary: STRING,
        totalPersonWeeks: NUMBER,
      },
      required: [
        'lowConfidenceFlags',
        'complexityAssessment',
        'teamComposition',
        'timeline',
        'costEstimate',
        'sprintPlan',
        'estimationRisks',
        'estimationSummary',
        'totalPersonWeeks',
      ],
    },
  },

  validation: {
    toolName: 'submit_validation_output',
    schema: {
      type: 'object',
      properties: {
        lowConfidenceFlags: arrayOf({
          type: 'object',
          properties: { field: STRING, reason: STRING },
          required: ['field', 'reason'],
        }),
        validationResult: { type: 'string', enum: ['PASS', 'CONDITIONAL_PASS', 'FAIL'] },
        scores: {
          type: 'object',
          additionalProperties: { type: 'number', minimum: 0, maximum: 10 },
        },
        issues: arrayOf(
          {
            type: 'object',
            properties: {
              externalId: STRING,
              severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
              category: STRING,
              sourceAgent: STRING,
              affectedIds: STRING_ARRAY,
              problem: STRING,
              evidence: STRING,
              impact: STRING,
              recommendedCorrection: STRING,
              responsibleAgent: STRING,
              requiresHumanDecision: BOOLEAN,
            },
            required: ['severity', 'category', 'sourceAgent', 'problem'],
          },
          0,
          8,
        ),
        summary: STRING,
      },
      required: ['validationResult', 'scores', 'issues', 'summary'],
    },
  },

  debate: {
    toolName: 'submit_debate_output',
    schema: {
      type: 'object',
      properties: {
        contradictions: arrayOf({
          type: 'object',
          properties: {
            externalId: STRING,
            conflictingItems: STRING_ARRAY,
            impact: STRING,
            recommendedResolution: STRING,
          },
          required: ['externalId', 'conflictingItems', 'impact'],
        }),
        assumptionsToValidate: arrayOf({
          type: 'object',
          properties: {
            externalId: STRING,
            sourceField: STRING,
            description: STRING,
            riskLevel: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
            validationNeeded: STRING,
          },
          required: ['externalId', 'sourceField', 'description', 'riskLevel'],
        }),
        debateTranscript: arrayOf({
          type: 'object',
          properties: {
            perspective: STRING,
            position: STRING,
            counterpoint: STRING,
          },
          required: ['perspective', 'position', 'counterpoint'],
        }),
        debateSummary: STRING,
        overallReadiness: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
        lowConfidenceFlags: arrayOf({
          type: 'object',
          properties: { field: STRING, reason: STRING },
          required: ['field', 'reason'],
        }),
      },
      required: [
        'contradictions',
        'assumptionsToValidate',
        'debateTranscript',
        'debateSummary',
        'overallReadiness',
        'lowConfidenceFlags',
      ],
    },
  },

  'gap-analysis': {
    toolName: 'submit_gap_analysis_output',
    schema: {
      type: 'object',
      properties: {
        coveragePct: { type: 'number', minimum: 0, maximum: 100 },
        qualityScore: { type: 'number', minimum: 0, maximum: 100 },
        totalGaps: { type: 'number' },
        resolvedGaps: { type: 'number' },
        remainingGaps: { type: 'number' },
        stopAfterThisIteration: { type: 'boolean' },
        summary: STRING,
        lowConfidenceFlags: arrayOf({
          type: 'object',
          properties: { field: STRING, reason: STRING },
          required: ['field', 'reason'],
        }),
        findings: arrayOf({
          type: 'object',
          properties: {
            document: STRING,
            action: { type: 'string', enum: ['KEEP', 'UPDATE', 'APPEND', 'DEPRECATE'] },
            section: STRING,
            finding: STRING,
            severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
            confidence: { type: 'number', minimum: 0, maximum: 100 },
            suggestion: STRING,
          },
          required: ['document', 'action', 'finding', 'severity'],
        }),
      },
      required: [
        'coveragePct',
        'qualityScore',
        'totalGaps',
        'resolvedGaps',
        'remainingGaps',
        'stopAfterThisIteration',
        'summary',
        'lowConfidenceFlags',
        'findings',
      ],
    },
  },

  'gap-patch': {
    toolName: 'submit_gap_patch_output',
    schema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['REPLACE', 'APPEND'] },
        section: STRING,
        newContent: STRING,
      },
      required: ['mode', 'newContent'],
    },
  },
};
export function getAgentStructuredSchema(agentKey: string): AgentStructuredSchema {
  const entry = AGENT_STRUCTURED_SCHEMAS[agentKey];
  if (!entry) {
    throw new Error(`No structured output schema registered for agent '${agentKey}'`);
  }
  return entry;
}
