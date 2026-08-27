/**
 * Pure metric helpers for the golden-dataset regression eval (P2-1).
 * Self-contained on purpose: the eval runner script imports this file directly
 * with Node's type stripping, so it must not depend on extensionless imports.
 */

export interface GoldenDatasetEntry {
  id: string;
  name: string;
  idea: string;
  description: string;
}

export interface FrScalingMetric {
  featureCount: number;
  frCount: number;
  ratio: number | null;
  atMax: boolean;
  scaled: boolean;
}

/**
 * FR count should scale with the feature count rather than pinning at the
 * stated max. `scaled` is true when the run is not at the cap and the FR:FEAT
 * ratio stays within a sane band (<= 2 FRs per feature).
 */
export function evaluateFrScaling(
  frCount: number,
  featureCount: number,
  maxFr = 20,
): FrScalingMetric {
  const atMax = frCount >= maxFr;
  const ratio = featureCount > 0 ? frCount / featureCount : null;
  const scaled = !atMax && (ratio === null || ratio <= 2);
  return { featureCount, frCount, ratio, atMax, scaled };
}

/** Validate the fixed golden dataset shape (5-10 entries, all fields present, unique ids). */
export function validateGoldenDataset(entries: unknown): string[] {
  const problems: string[] = [];
  if (!Array.isArray(entries)) return ['dataset must be an array'];
  if (entries.length < 5) {
    problems.push(`dataset has ${entries.length} entries; expected at least 5`);
  }
  if (entries.length > 10) {
    problems.push(`dataset has ${entries.length} entries; expected at most 10`);
  }

  const ids = new Set<string>();
  entries.forEach((entry, index) => {
    const record = entry as Record<string, unknown>;
    for (const field of ['id', 'name', 'idea', 'description'] as const) {
      if (typeof record?.[field] !== 'string' || !(record[field] as string).trim()) {
        problems.push(`entry ${index}: missing or empty '${field}'`);
      }
    }
    if (typeof record?.id === 'string') {
      if (ids.has(record.id)) problems.push(`entry ${index}: duplicate id '${record.id}'`);
      ids.add(record.id);
    }
  });
  return problems;
}

export interface RunLogEvent {
  kind: string;
  agentKey: string;
  data?: Record<string, unknown>;
}

export interface RunLogSummary {
  total: number;
  retries: number;
  parseFailures: number;
  validationFailures: number;
  idIntegrityViolations: number;
  paddingFlags: number;
  retriesByAgent: Record<string, number>;
}

/** Aggregate persisted run logs into the P2-1 metric categories. */
export function summarizeRunLogs(logs: RunLogEvent[]): RunLogSummary {
  const summary: RunLogSummary = {
    total: logs.length,
    retries: 0,
    parseFailures: 0,
    validationFailures: 0,
    idIntegrityViolations: 0,
    paddingFlags: 0,
    retriesByAgent: {},
  };

  for (const log of logs) {
    switch (log.kind) {
      case 'retry':
        summary.retries += 1;
        summary.retriesByAgent[log.agentKey] = (summary.retriesByAgent[log.agentKey] ?? 0) + 1;
        if (Array.isArray(log.data?.codes) && log.data!.codes.includes('DANGLING_REFERENCE')) {
          summary.idIntegrityViolations += 1;
        }
        break;
      case 'parse_failure':
        summary.parseFailures += 1;
        break;
      case 'validation_failure':
        summary.validationFailures += 1;
        break;
      case 'padding':
        summary.paddingFlags += 1;
        break;
      default:
        break;
    }
  }
  return summary;
}
