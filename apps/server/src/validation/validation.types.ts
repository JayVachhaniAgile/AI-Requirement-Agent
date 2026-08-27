export type ScalarType = 'string' | 'number' | 'boolean' | 'object';

export type FindingCode =
  | 'MISSING_FIELD'
  | 'WRONG_TYPE'
  | 'ARRAY_BELOW_MIN'
  | 'ARRAY_ABOVE_MAX'
  | 'PADDING'
  | 'INVALID_ENUM'
  | 'DANGLING_REFERENCE'
  | 'DUPLICATE_ID'
  | 'INVALID_SCORE';

export interface AgentValidationFinding {
  code: FindingCode;
  field: string;
  value?: unknown;
  message: string;
  details?: {
    allowed?: string[];
    validIds?: string[];
  };
}

export interface ArrayFieldRule {
  /** Dot path to the array (e.g. `functionalRequirements`). */
  path: string;
  /** Minimum item count. Below this is a failure unless a summary field explains why. */
  min: number;
  /** Maximum item count. Above this is a failure; hitting it exactly raises a padding flag. */
  max?: number;
  /** Required shape of each item: field name -> expected scalar type. */
  itemFields?: Record<string, ScalarType>;
}

export interface EnumRule {
  /** Dot path, may traverse arrays (e.g. `features[].priority`). */
  path: string;
  values: readonly string[];
}

export interface ReferenceRule {
  /** Dot path, may traverse arrays. Array values are flattened (e.g. `issues[].affectedIds`). */
  path: string;
  /**
   * Allowed upstream ID prefixes (e.g. `['BR']`). When omitted/empty, the value may
   * resolve to any known upstream ID regardless of prefix.
   */
  allowedPrefixes?: readonly string[];
}

export interface IdFieldRule {
  /** Dot path to an array of items that carry an ID (e.g. `features`). */
  path: string;
  /** Property that holds the ID on each item. Defaults to `externalId`. */
  idKey?: string;
  /** Expected ID prefix (e.g. `FR`). Mismatches are logged as soft warnings. */
  prefix?: string;
  /** When true, items must carry a non-empty ID; missing IDs are hard findings. */
  requireIds?: boolean;
}

export interface ScoreRangeRule {
  /** Dot path to a record of numeric scores (e.g. `scores`). */
  path: string;
  min: number;
  max: number;
}

export interface NumberRangeRule {
  /** Dot path to a scalar numeric field (e.g. `coveragePct`). */
  path: string;
  min: number;
  max: number;
}

export interface AgentValidationConfig {
  agentKey: string;
  /** Required scalar fields: path -> expected type. */
  requiredFields?: Record<string, ScalarType>;
  /** Array fields with item-count bounds and item shape checks. */
  arrays?: ArrayFieldRule[];
  /** Enum-constrained scalar fields. */
  enums?: EnumRule[];
  /** Cross-agent ID reference fields. */
  references?: ReferenceRule[];
  /** Fields that contribute item IDs for uniqueness/format checks. */
  idFields?: IdFieldRule[];
  /** Record fields with numeric ranges (e.g. critic scores). */
  scoreRanges?: ScoreRangeRule[];
  /** Scalar numeric fields with min/max bounds. */
  numberRanges?: NumberRangeRule[];
  /** Root-level summary fields that can excuse a below-min array. */
  summaryFields?: string[];
}

export interface AgentValidationResult {
  valid: boolean;
  /** Hard failures — pipeline must not proceed with these. */
  findings: AgentValidationFinding[];
  /** Soft signals that are logged but never block. */
  warnings: AgentValidationFinding[];
  /** Prompt-quota-filling pattern flags (array hit exact max) — log, never block. */
  paddingFlags: AgentValidationFinding[];
}

export type UpstreamIdIndex = Record<string, Set<string>>;
