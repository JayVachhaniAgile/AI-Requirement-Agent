import { AGENT_VALIDATION_CONFIGS } from './agent-validation.config';
import type {
  AgentValidationConfig,
  AgentValidationFinding,
  AgentValidationResult,
  ArrayFieldRule,
  ReferenceRule,
  ScalarType,
  UpstreamIdIndex,
} from './validation.types';

const ID_PREFIX_RE = /^[A-Za-z]+(?:-[A-Za-z]+)*/;

/** Extract the leading prefix of an ID, e.g. `BR-001` -> `BR`, `SEC-AUTH-001` -> `SEC-AUTH`. */
export function extractIdPrefix(id: string): string {
  return id.match(ID_PREFIX_RE)?.[0] ?? id;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function matchesType(value: unknown, type: ScalarType): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !Number.isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return isObject(value);
  }
}

/**
 * Resolve a dot path against a candidate output. Segments ending in `[]` traverse
 * array items; the result is the list of resolved values (undefined entries are kept
 * so callers can distinguish "absent" from "present").
 */
export function resolvePath(root: unknown, path: string): { found: boolean; values: unknown[] } {
  let values: unknown[] = [root];
  const segments = path.split('.').filter(Boolean);

  for (const rawSegment of segments) {
    const isArrayStep = rawSegment.endsWith('[]');
    const segment = isArrayStep ? rawSegment.slice(0, -2) : rawSegment;
    const next: unknown[] = [];

    for (const value of values) {
      if (!isObject(value)) continue;
      const target = value[segment];
      if (isArrayStep) {
        if (Array.isArray(target)) next.push(...target);
      } else {
        next.push(target);
      }
    }
    values = next;
  }

  return { found: values.length > 0, values };
}

function checkRequiredFields(
  output: unknown,
  config: AgentValidationConfig,
  findings: AgentValidationFinding[],
): void {
  for (const [path, type] of Object.entries(config.requiredFields ?? {})) {
    const { values } = resolvePath(output, path);
    const value = values[0];
    if (value === undefined || value === null) {
      findings.push({
        code: 'MISSING_FIELD',
        field: path,
        value,
        message: `Required field '${path}' is missing.`,
      });
      continue;
    }
    if (!matchesType(value, type)) {
      findings.push({
        code: 'WRONG_TYPE',
        field: path,
        value,
        message: `Field '${path}' must be a ${type}, got ${typeof value}.`,
      });
    }
  }
}

function hasSummaryExcuse(output: unknown, summaryFields: string[]): boolean {
  return summaryFields.some((path) => {
    const { values } = resolvePath(output, path);
    const value = values[0];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

function checkArrays(
  output: unknown,
  config: AgentValidationConfig,
  findings: AgentValidationFinding[],
  warnings: AgentValidationFinding[],
  paddingFlags: AgentValidationFinding[],
): void {
  const summaryFields = config.summaryFields ?? [];

  for (const rule of config.arrays ?? []) {
    const { values } = resolvePath(output, rule.path);
    const array = values[0];

    if (array === undefined) {
      if (rule.min > 0) {
        findings.push({
          code: 'ARRAY_BELOW_MIN',
          field: rule.path,
          value: undefined,
          message: `Array '${rule.path}' is missing; expected at least ${rule.min} items.`,
        });
      }
      continue;
    }

    if (!Array.isArray(array)) {
      findings.push({
        code: 'WRONG_TYPE',
        field: rule.path,
        value: array,
        message: `Field '${rule.path}' must be an array, got ${typeof array}.`,
      });
      continue;
    }

    if (rule.max !== undefined) {
      if (array.length > rule.max) {
        findings.push({
          code: 'ARRAY_ABOVE_MAX',
          field: rule.path,
          value: array.length,
          message: `Array '${rule.path}' has ${array.length} items; expected at most ${rule.max}.`,
        });
      } else if (array.length === rule.max && rule.max > 0) {
        paddingFlags.push({
          code: 'PADDING',
          field: rule.path,
          value: array.length,
          message: `Array '${rule.path}' hit the exact stated max (${rule.max}) — possible prompt-quota filling.`,
        });
      }
    }

    if (array.length < rule.min) {
      const excused = hasSummaryExcuse(output, summaryFields);
      const finding: AgentValidationFinding = {
        code: 'ARRAY_BELOW_MIN',
        field: rule.path,
        value: array.length,
        message: `Array '${rule.path}' has ${array.length} items; expected at least ${rule.min}.${
          excused ? ' Excused by summary field.' : ''
        }`,
      };
      if (excused) {
        warnings.push(finding);
      } else {
        findings.push(finding);
      }
    }

    checkItemShape(rule, array, findings);
  }
}

function checkItemShape(
  rule: ArrayFieldRule,
  array: unknown[],
  findings: AgentValidationFinding[],
): void {
  for (const [field, type] of Object.entries(rule.itemFields ?? {})) {
    for (let i = 0; i < array.length; i++) {
      const item = array[i];
      const location = `${rule.path}[${i}].${field}`;
      if (!isObject(item)) {
        findings.push({
          code: 'WRONG_TYPE',
          field: `${rule.path}[${i}]`,
          value: item,
          message: `Item at '${rule.path}[${i}]' must be an object, got ${typeof item}.`,
        });
        continue;
      }
      const value = item[field];
      if (value === undefined || value === null) {
        findings.push({
          code: 'MISSING_FIELD',
          field: location,
          value,
          message: `Required field '${location}' is missing.`,
        });
      } else if (!matchesType(value, type)) {
        findings.push({
          code: 'WRONG_TYPE',
          field: location,
          value,
          message: `Field '${location}' must be a ${type}, got ${typeof value}.`,
        });
      }
    }
  }
}

function checkEnums(
  output: unknown,
  config: AgentValidationConfig,
  findings: AgentValidationFinding[],
): void {
  for (const rule of config.enums ?? []) {
    const { values } = resolvePath(output, rule.path);
    const allowed = new Set(rule.values);
    for (const value of values) {
      if (value === undefined || value === null) continue;
      if (typeof value !== 'string' || !allowed.has(value)) {
        findings.push({
          code: 'INVALID_ENUM',
          field: rule.path,
          value,
          message: `Field '${rule.path}' must be one of ${rule.values.join('|')}, got '${String(value)}'.`,
          details: { allowed: [...rule.values] },
        });
      }
    }
  }
}

function checkIds(
  output: unknown,
  config: AgentValidationConfig,
  findings: AgentValidationFinding[],
): void {
  const seen = new Map<string, string>();

  for (const rule of config.idFields ?? []) {
    const idKey = rule.idKey ?? 'externalId';
    const { values } = resolvePath(output, rule.path);

    for (const item of values) {
      const candidates: unknown[] = Array.isArray(item) ? item : [item];
      for (const candidate of candidates) {
        if (!isObject(candidate)) continue;
        const raw = candidate[idKey];
        if (typeof raw !== 'string' || raw.trim() === '') {
          if (rule.requireIds) {
            findings.push({
              code: 'MISSING_FIELD',
              field: `${rule.path}[].${idKey}`,
              value: raw,
              message: `Item in '${rule.path}' is missing its '${idKey}' (expected a '${rule.prefix ?? 'ID'}'-prefixed id).`,
            });
          }
          continue;
        }
        const id = raw.trim();
        const location = `${rule.path}[].${idKey}`;

        const previous = seen.get(id);
        if (previous) {
          findings.push({
            code: 'DUPLICATE_ID',
            field: location,
            value: id,
            message: `Duplicate ID '${id}' (also present in '${previous}').`,
          });
        } else {
          seen.set(id, location);
        }
      }
    }
  }
}

function checkScoreRanges(
  output: unknown,
  config: AgentValidationConfig,
  findings: AgentValidationFinding[],
): void {
  for (const rule of config.scoreRanges ?? []) {
    const { values } = resolvePath(output, rule.path);
    const record = values[0];
    if (record === undefined || record === null) continue;
    if (!isObject(record)) {
      findings.push({
        code: 'WRONG_TYPE',
        field: rule.path,
        value: record,
        message: `Field '${rule.path}' must be an object of numeric scores, got ${typeof record}.`,
      });
      continue;
    }
    for (const [key, value] of Object.entries(record)) {
      if (
        typeof value !== 'number' ||
        Number.isNaN(value) ||
        value < rule.min ||
        value > rule.max
      ) {
        findings.push({
          code: 'INVALID_SCORE',
          field: `${rule.path}.${key}`,
          value,
          message: `Score '${key}' must be a number between ${rule.min} and ${rule.max}, got '${String(value)}'.`,
          details: { allowed: [String(rule.min), String(rule.max)] },
        });
      }
    }
  }
}

function checkNumberRanges(
  output: unknown,
  config: AgentValidationConfig,
  findings: AgentValidationFinding[],
): void {
  for (const rule of config.numberRanges ?? []) {
    const { values } = resolvePath(output, rule.path);
    const value = values[0];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'number' || Number.isNaN(value) || value < rule.min || value > rule.max) {
      findings.push({
        code: 'INVALID_SCORE',
        field: rule.path,
        value,
        message: `Field '${rule.path}' must be a number between ${rule.min} and ${rule.max}, got '${String(value)}'.`,
        details: { allowed: [String(rule.min), String(rule.max)] },
      });
    }
  }
}

/**
 * Generic cross-agent ID integrity check. Every value found at a reference path
 * must resolve to an ID that literally exists in the upstream ID sets.
 */
export function validateReferences(
  output: unknown,
  allowedIdsByPrefix: UpstreamIdIndex,
  rules: ReferenceRule[],
): AgentValidationFinding[] {
  const findings: AgentValidationFinding[] = [];
  const allIds = new Set<string>();
  for (const ids of Object.values(allowedIdsByPrefix)) {
    for (const id of ids) allIds.add(id);
  }

  for (const rule of rules) {
    const { values } = resolvePath(output, rule.path);
    for (const value of values) {
      if (value === undefined || value === null) continue;
      const refs: unknown[] = Array.isArray(value) ? value : [value];

      for (const ref of refs) {
        if (ref === undefined || ref === null) continue;
        const id = String(ref).trim();
        if (id === '') continue;

        const prefix = extractIdPrefix(id);
        const allowedPrefixes = rule.allowedPrefixes;

        if (allowedPrefixes && allowedPrefixes.length > 0 && !allowedPrefixes.includes(prefix)) {
          findings.push({
            code: 'DANGLING_REFERENCE',
            field: rule.path,
            value: id,
            message: `Field '${rule.path}' value '${id}' does not match allowed prefixes. Expected one of: ${allowedPrefixes.join(', ')}.`,
            details: { allowed: [...allowedPrefixes] },
          });
          continue;
        }

        const pool =
          allowedPrefixes && allowedPrefixes.length > 0 ? allowedIdsByPrefix[prefix] : null;

        if (pool === undefined) {
          findings.push({
            code: 'DANGLING_REFERENCE',
            field: rule.path,
            value: id,
            message: `Field '${rule.path}' value '${id}' does not exist — no upstream IDs for prefix '${prefix}'.`,
            details: { validIds: [] },
          });
          continue;
        }

        const candidates = pool ?? allIds;
        if (!candidates.has(id)) {
          const sample = [...candidates].slice(0, 25).join(', ');
          findings.push({
            code: 'DANGLING_REFERENCE',
            field: rule.path,
            value: id,
            message: `Field '${rule.path}' value '${id}' does not exist. Valid IDs from input: ${sample}${candidates.size > 25 ? '…' : ''}.`,
            details: { validIds: [...candidates] },
          });
        }
      }
    }
  }

  return findings;
}

/**
 * Build an ID index from upstream knowledge items, keyed by ID prefix.
 * `items` may be any list of objects carrying an `externalId` or `id`.
 */
export function buildAllowedIdIndex(items: Array<{ externalId?: string | null; id?: string | null }>): UpstreamIdIndex {
  const index: UpstreamIdIndex = {};
  for (const item of items) {
    const rawId = item?.externalId || item?.id;
    if (typeof rawId !== 'string' || rawId.trim() === '') continue;
    const trimmed = rawId.trim();
    const prefix = extractIdPrefix(trimmed);
    (index[prefix] ??= new Set()).add(trimmed);
  }
  return index;
}

export interface ValidateAgentOutputArgs {
  agentKey: string;
  /** Candidate LLM output (already parsed to an object). */
  output: unknown;
  /** Upstream IDs available to this agent, keyed by prefix. */
  allowedIdsByPrefix?: UpstreamIdIndex;
  /** Optional per-call config override (defaults to the registered agent config). */
  config?: AgentValidationConfig;
}

/**
 * Deterministic post-generation validator. Pure function:
 * (schema + upstream-context + candidate-output) -> pass/fail + reasons.
 * Never calls the LLM.
 */
export function validateAgentOutput(args: ValidateAgentOutputArgs): AgentValidationResult {
  const config = args.config ?? AGENT_VALIDATION_CONFIGS[args.agentKey];
  if (!config) {
    return {
      valid: false,
      findings: [
        {
          code: 'MISSING_FIELD',
          field: 'agentKey',
          value: args.agentKey,
          message: `No validation config registered for agent '${args.agentKey}'.`,
        },
      ],
      warnings: [],
      paddingFlags: [],
    };
  }

  const findings: AgentValidationFinding[] = [];
  const warnings: AgentValidationFinding[] = [];
  const paddingFlags: AgentValidationFinding[] = [];

  checkRequiredFields(args.output, config, findings);
  checkArrays(args.output, config, findings, warnings, paddingFlags);
  checkEnums(args.output, config, findings);
  checkIds(args.output, config, findings);
  checkScoreRanges(args.output, config, findings);
  checkNumberRanges(args.output, config, findings);
  findings.push(
    ...validateReferences(args.output, args.allowedIdsByPrefix ?? {}, config.references ?? []),
  );

  return { valid: findings.length === 0, findings, warnings, paddingFlags };
}

export function getAgentValidationConfig(agentKey: string): AgentValidationConfig | undefined {
  return AGENT_VALIDATION_CONFIGS[agentKey];
}
