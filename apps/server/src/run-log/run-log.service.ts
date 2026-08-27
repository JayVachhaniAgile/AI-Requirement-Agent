import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { RunLog } from '../database/entities';
import type { AgentValidationFinding } from '../validation/validation.types';

export type RunLogKind =
  'retry' | 'parse_failure' | 'validation_failure' | 'padding' | 'low_confidence' | 'drift';

export interface LowConfidenceFlag {
  externalId: string | null;
  title: string;
  confidence: number;
}

/** Extract knowledge items whose confidence falls below the threshold (P2-3). */
export function extractLowConfidenceFlags(
  items: Array<{ externalId?: string | null; title?: string; confidence?: number | null }>,
  minConfidence: number,
): LowConfidenceFlag[] {
  return items
    .filter((item) => typeof item.confidence === 'number' && item.confidence < minConfidence)
    .map((item) => ({
      externalId: item.externalId ?? null,
      title: item.title ?? 'Untitled',
      confidence: item.confidence as number,
    }));
}

export interface RunLogPatternSummary {
  windowDays: number | null;
  totalsByKind: Record<string, number>;
  retriesByAgent: Record<string, number>;
  parseFailuresByAgent: Record<string, number>;
  validationFailuresByAgent: Record<string, number>;
  idIntegrityByAgent: Record<string, number>;
  paddingByAgent: Record<string, number>;
  lowConfidenceByAgent: Record<string, number>;
  topFailureMessages: Array<{ agentKey: string; kind: string; message: string; count: number }>;
}

type RunLogRow = {
  kind: string;
  agentKey: string;
  message: string;
  data?: Record<string, unknown>;
};

/** Aggregate persisted run logs into per-agent pattern counts (P2-3). */
export function aggregateRunLogPatterns(
  rows: RunLogRow[],
): Omit<RunLogPatternSummary, 'windowDays'> {
  const totalsByKind: Record<string, number> = {};
  const retriesByAgent: Record<string, number> = {};
  const parseFailuresByAgent: Record<string, number> = {};
  const validationFailuresByAgent: Record<string, number> = {};
  const idIntegrityByAgent: Record<string, number> = {};
  const paddingByAgent: Record<string, number> = {};
  const lowConfidenceByAgent: Record<string, number> = {};
  const messageCounts = new Map<
    string,
    { agentKey: string; kind: string; message: string; count: number }
  >();

  for (const row of rows) {
    totalsByKind[row.kind] = (totalsByKind[row.kind] ?? 0) + 1;

    if (row.kind === 'retry' || row.kind === 'parse_failure') {
      retriesByAgent[row.agentKey] = (retriesByAgent[row.agentKey] ?? 0) + 1;
      if (Array.isArray(row.data?.codes) && row.data!.codes.includes('DANGLING_REFERENCE')) {
        idIntegrityByAgent[row.agentKey] = (idIntegrityByAgent[row.agentKey] ?? 0) + 1;
      }
    }
    if (row.kind === 'parse_failure') {
      parseFailuresByAgent[row.agentKey] = (parseFailuresByAgent[row.agentKey] ?? 0) + 1;
    }
    if (row.kind === 'validation_failure') {
      validationFailuresByAgent[row.agentKey] = (validationFailuresByAgent[row.agentKey] ?? 0) + 1;
    }
    if (row.kind === 'padding') {
      paddingByAgent[row.agentKey] = (paddingByAgent[row.agentKey] ?? 0) + 1;
    }
    if (row.kind === 'low_confidence') {
      lowConfidenceByAgent[row.agentKey] = (lowConfidenceByAgent[row.agentKey] ?? 0) + 1;
    }

    const key = `${row.agentKey}\u0000${row.kind}\u0000${row.message}`;
    const existing = messageCounts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      messageCounts.set(key, {
        agentKey: row.agentKey,
        kind: row.kind,
        message: row.message,
        count: 1,
      });
    }
  }

  const topFailureMessages = [...messageCounts.values()]
    .filter(
      (m) => m.kind === 'retry' || m.kind === 'parse_failure' || m.kind === 'validation_failure',
    )
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return {
    totalsByKind,
    retriesByAgent,
    parseFailuresByAgent,
    validationFailuresByAgent,
    idIntegrityByAgent,
    paddingByAgent,
    lowConfidenceByAgent,
    topFailureMessages,
  };
}

/**
 * Persists per-run pipeline events (retries, parse/validation failures,
 * padding flags). Feeds the golden-dataset eval (P2-1) and the pattern-review
 * aggregation view (P2-3).
 */
@Injectable()
export class RunLogService {
  private readonly logger = new Logger(RunLogService.name);

  constructor(@InjectRepository(RunLog) private readonly runLogRepo: Repository<RunLog>) {}

  async log(
    projectId: string,
    agentKey: string,
    kind: RunLogKind,
    message: string,
    data?: Record<string, unknown>,
    versions?: { promptVersion?: string; schemaVersion?: string },
  ): Promise<void> {
    try {
      await this.runLogRepo.save(
        this.runLogRepo.create({
          id: randomUUID(),
          projectId,
          agentKey,
          kind,
          message,
          dataJson: data ? JSON.stringify(data) : null,
          promptVersion: versions?.promptVersion ?? null,
          schemaVersion: versions?.schemaVersion ?? null,
        }),
      );
    } catch (err: unknown) {
      // Logging must never break the pipeline.
      this.logger.warn(`Failed to persist run log (${kind}): ${err}`);
    }
  }

  async logRetry(
    projectId: string,
    agentKey: string,
    attempt: number,
    reasons: string[],
    codes: string[],
    parseFailed: boolean,
    versions?: { promptVersion?: string; schemaVersion?: string },
  ): Promise<void> {
    await this.log(
      projectId,
      agentKey,
      parseFailed ? 'parse_failure' : 'retry',
      `Agent '${agentKey}' failed validation on attempt ${attempt}: ${reasons.join(' | ')}`,
      { attempt, reasons, codes, parseFailed },
      versions,
    );
  }

  async logValidationFailure(
    projectId: string,
    agentKey: string,
    attempts: number,
    findings: AgentValidationFinding[],
    versions?: { promptVersion?: string; schemaVersion?: string },
  ): Promise<void> {
    await this.log(
      projectId,
      agentKey,
      'validation_failure',
      `Agent '${agentKey}' exhausted validation retries after ${attempts} attempts`,
      {
        attempts,
        messages: findings.map((f) => f.message),
        codes: findings.map((f) => f.code),
      },
      versions,
    );
  }

  async logPadding(
    projectId: string,
    agentKey: string,
    message: string,
    data: Record<string, unknown>,
    versions?: { promptVersion?: string; schemaVersion?: string },
  ): Promise<void> {
    await this.log(projectId, agentKey, 'padding', message, data, versions);
  }

  async logLowConfidence(
    projectId: string,
    agentKey: string,
    message: string,
    data: Record<string, unknown>,
    versions?: { promptVersion?: string; schemaVersion?: string },
  ): Promise<void> {
    await this.log(projectId, agentKey, 'low_confidence', message, data, versions);
  }

  async listByProject(
    projectId: string,
  ): Promise<Array<RunLog & { data?: Record<string, unknown> }>> {
    const rows = await this.runLogRepo.find({
      where: { projectId },
      order: { createdAt: 'ASC' },
    });
    return rows.map((row) => ({
      ...row,
      data: row.dataJson ? (JSON.parse(row.dataJson) as Record<string, unknown>) : undefined,
    }));
  }

  /** Low-confidence flags raised by every agent for a project (for the Debate agent). */
  async listLowConfidenceFlags(
    projectId: string,
  ): Promise<Array<{ agentKey: string; field: string; reason: string }>> {
    const rows = await this.runLogRepo.find({
      where: { projectId, kind: 'low_confidence' },
      order: { createdAt: 'ASC' },
    });
    return rows.flatMap((row) => {
      if (!row.dataJson) return [];
      try {
        const data = JSON.parse(row.dataJson) as { field?: unknown; reason?: unknown };
        if (typeof data.field === 'string' && typeof data.reason === 'string') {
          return [{ agentKey: row.agentKey, field: data.field, reason: data.reason }];
        }
      } catch {
        /* skip malformed rows */
      }
      return [];
    });
  }

  /** Cross-project pattern summary for the review view (P2-3). */
  async getPatternSummary(days?: number): Promise<RunLogPatternSummary> {
    const rows = await this.runLogRepo.find({
      where:
        days && days > 0 ? { createdAt: MoreThan(new Date(Date.now() - days * 86_400_000)) } : {},
      order: { createdAt: 'ASC' },
    });
    const patterns = aggregateRunLogPatterns(
      rows.map((row) => ({
        kind: row.kind,
        agentKey: row.agentKey,
        message: row.message,
        data: row.dataJson ? (JSON.parse(row.dataJson) as Record<string, unknown>) : undefined,
      })),
    );
    return { windowDays: days && days > 0 ? days : null, ...patterns };
  }
}
