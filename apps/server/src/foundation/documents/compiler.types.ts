/**
 * Artifact Compiler types (Phase 9).
 *
 * STRUCTURED PROJECT DATA → COMPILER → DOCUMENT.
 * The compiler renders the Canonical Project Model deterministically; LLMs are
 * never the source of canonical facts.
 */

export const COMPILER_DOCUMENT_TYPES = [
  'FRD',
  'USER_STORIES',
  'TECHNICAL_ARCHITECTURE',
  'DATABASE_DESIGN',
  'API_SPECIFICATION',
  'QA_DOCUMENT',
  'SOW',
  'BUILD_PROMPT',
] as const;

export type CompilerDocumentType = (typeof COMPILER_DOCUMENT_TYPES)[number];

/** Map compiler doc types to the persisted `documents.document_type` values. */
export const DOCUMENT_TYPE_MAP: Record<CompilerDocumentType, string> = {
  FRD: 'FRD_DOCUMENT',
  USER_STORIES: 'USER_STORIES_DOCUMENT',
  TECHNICAL_ARCHITECTURE: 'TECH_ARCH_DOCUMENT',
  DATABASE_DESIGN: 'DB_DESIGN_DOCUMENT',
  API_SPECIFICATION: 'API_SPEC_DOCUMENT',
  QA_DOCUMENT: 'QA_DOCUMENT',
  SOW: 'SOW_DOCUMENT',
  BUILD_PROMPT: 'BUILD_PROMPT_DOCUMENT',
};

export interface CompilerArtifact {
  externalId: string;
  kind: string;
  title: string;
  summary?: string | null;
  body?: Record<string, unknown> | null;
  confidence?: number | null;
  status?: string | null;
  version?: number;
  provenance?: {
    epistemicClass?: string;
    sources?: Array<{ category: string; refId?: string; label?: string; excerpt?: string }>;
  } | null;
}

export interface CompilerDependencyEdge {
  sourceArtifactId: string;
  targetArtifactId: string;
  relation: string;
}

export type CompilationWarningType =
  | 'missing-required-kind'
  | 'missing-provenance'
  | 'low-confidence'
  | 'dangling-dependency'
  | 'empty-section';

export interface CompilationWarning {
  type: CompilationWarningType;
  message: string;
  artifactKey?: string;
}

export interface CompileRequest {
  projectId: string;
  documentType: CompilerDocumentType;
  artifacts: CompilerArtifact[];
  dependencies?: CompilerDependencyEdge[];
  compilerVersion?: string;
  templateVersion?: string;
  /** Injectable for deterministic compilation/tests; defaults to now. */
  generatedAt?: string;
  options?: {
    includeProvenance?: boolean;
    includeMetadata?: boolean;
    includeTraceability?: boolean;
  };
}

export interface CompiledDocument {
  documentType: CompilerDocumentType;
  persistedDocumentType: string;
  markdown: string;
  warnings: CompilationWarning[];
  missingRequiredKinds: string[];
  sourceArtifactCount: number;
  compilerVersion: string;
  templateVersion: string;
  generatedAt: string;
}

export const COMPILER_VERSION = '9.0.0';
export const COMPILER_TEMPLATE_VERSION = '1.0.0';

/** Required canonical kinds per document type (completeness contract). */
export const REQUIRED_KINDS: Record<CompilerDocumentType, string[]> = {
  FRD: ['project_goal', 'requirement', 'business_rule', 'assumption'],
  USER_STORIES: ['requirement', 'user_story', 'acceptance_criterion'],
  TECHNICAL_ARCHITECTURE: ['architecture_decision', 'api'],
  DATABASE_DESIGN: ['entity', 'relationship'],
  API_SPECIFICATION: ['api', 'security_requirement'],
  QA_DOCUMENT: ['requirement', 'test_case'],
  SOW: ['scope_item', 'estimate', 'requirement'],
  BUILD_PROMPT: ['requirement', 'user_story', 'entity', 'api', 'test_case'],
};
