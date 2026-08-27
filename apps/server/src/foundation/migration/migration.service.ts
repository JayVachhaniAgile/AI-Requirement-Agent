import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { AgentComparison } from './agent-comparison.entity';
import type { ComparisonRecord, ComparisonMetrics, MigrationVerdict, AgentOutputSummary } from './migration.types';
import type { MigrationMode } from './migration.config';

export interface StoreComparisonInput {
  projectId: string;
  workflowExecutionId?: string;
  agentKey: string;
  batch: number | null;
  mode: MigrationMode;
  legacy: AgentOutputSummary;
  skill: AgentOutputSummary;
  metrics: ComparisonMetrics;
  verdict: MigrationVerdict;
}

/**
 * Persists legacy-vs-skill comparison results (shadow migration observability).
 * These rows are analytics only — they never affect production project state.
 */
@Injectable()
export class MigrationComparisonService {
  constructor(
    @InjectRepository(AgentComparison)
    private readonly repo: Repository<AgentComparison>,
  ) {}

  async store(input: StoreComparisonInput): Promise<AgentComparison> {
    const row = this.repo.create({
      id: randomUUID(),
      projectId: input.projectId,
      workflowExecutionId: input.workflowExecutionId ?? null,
      agentKey: input.agentKey,
      batch: input.batch,
      mode: input.mode,
      legacy: input.legacy as unknown as Record<string, unknown>,
      skill: input.skill as unknown as Record<string, unknown>,
      metrics: input.metrics as unknown as Record<string, unknown>,
      verdict: input.verdict as unknown as Record<string, unknown>,
    });
    return this.repo.save(row);
  }

  list(options: { projectId?: string; agentKey?: string; limit?: number } = {}): Promise<AgentComparison[]> {
    const where: Record<string, unknown> = {};
    if (options.projectId) where.projectId = options.projectId;
    if (options.agentKey) where.agentKey = options.agentKey;
    return this.repo.find({
      where,
      order: { createdAt: 'DESC' },
      take: options.limit ?? 100,
    });
  }
}
