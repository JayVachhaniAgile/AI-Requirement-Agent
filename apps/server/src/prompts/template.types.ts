/**
 * Prompt Builder DSL — declarative prompt templates with variables,
 * block references, and few-shot examples.
 */

export type PromptVars = Record<string, unknown>;

/** A prompt part: literal string (with {{var}} and @block: refs) or a render function. */
export type PromptPart = string | ((vars: PromptVars) => string);

/** Few-shot example pair for in-context learning. */
export interface FewShotExample {
  user: string;
  assistant: string;
}

/** Variable contract for documentation & validation. */
export interface PromptVariableSpec {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  required?: boolean;
}

/** Canonical prompt template. */
export interface PromptTemplate {
  /** Stable key used to look up this template (e.g. 'agent:discovery', 'document:frd'). */
  key: string;
  /** 'agent' = structured output agent; 'document' = document generator. */
  kind: 'agent' | 'document';
  /** Human description. */
  description?: string;
  /** System prompt: array of parts (concatenated with '\n\n') or single part. */
  system: PromptPart | readonly PromptPart[];
  /** User prompt (optional). If function, receives resolved vars. */
  user?: PromptPart | readonly PromptPart[];
  /** Few-shot examples inserted between system and user. */
  fewShot?: readonly FewShotExample[];
  /** Declared variables (for docs, validation, preview). */
  variables?: Record<string, PromptVariableSpec>;
  /** Manual semantic version override (major/minor). Patch is content-hash derived. */
  version?: { major?: number; minor?: number };
  /** Optional function to map runtime input (e.g. AgentContext) to template vars. */
  resolveVars?: (input: PromptVars) => PromptVars;
}

/** Type-safe template constructor (narrow identity, no runtime cost). */
export function definePrompt<T extends PromptTemplate>(template: T): T {
  return template;
}

/** Canonical keys for built-in template types. */
export const AGENT_TEMPLATE_PREFIX = 'agent:';
export const DOCUMENT_TEMPLATE_PREFIX = 'document:';

/** Resolve the agent template key for an agent key. */
export function agentTemplateKey(agentKey: string): string {
  return `${AGENT_TEMPLATE_PREFIX}${agentKey}`;
}

/** Resolve the document template key for a document type. */
export function documentTemplateKey(docType: string): string {
  return `${DOCUMENT_TEMPLATE_PREFIX}${docType}`;
}
