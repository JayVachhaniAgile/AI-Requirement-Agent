import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { ModelUsage } from '../../database/entities';
import { estimateCost, type CostEstimate } from './model-pricing';

export interface RecordUsageInput {
  projectId: string;
  workflowExecutionId?: string;
  skillExecutionId?: string;
  skillKey?: string;
  model: string;
  provider?: string;
  mode?: string;
  inputTokens: number;
  outputTokens: number;
  metadata?: Record<string, unknown>;
}

export interface UsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  byModel: Record<string, { input: number; output: number; cost: number }>;
  bySkill: Record<string, { input: number; output: number; cost: number }>;
}

/**
 * Model usage (new architecture) — token/cost tracking per LLM call.
 *
 * Writes `model_usage` rows and exposes aggregate summaries. Sits alongside
 * `agent_executions` (which records execution status) — token counts are
 * persisted both places to keep legacy analytics unaffected.
 */
@Injectable()
export class ModelUsageService {
  private readonly logger = new Logger(ModelUsageService.name);

  constructor(
    @InjectRepository(ModelUsage)
    private readonly usageRepo: Repository<ModelUsage>,
  ) {}

  async record(input: RecordUsageInput): Promise<ModelUsage> {
    const cost: CostEstimate = estimateCost(
      input.model,
      input.inputTokens,
      input.outputTokens,
    );
    const row = this.usageRepo.create({
      id: randomUUID(),
      projectId: input.projectId,
      workflowExecutionId: input.workflowExecutionId ?? null,
      skillExecutionId: input.skillExecutionId ?? null,
      skillKey: input.skillKey ?? null,
      model: input.model,
      provider: input.provider ?? null,
      mode: input.mode ?? null,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      estimatedCostUsd: cost.totalCostUsd,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    });
    return this.usageRepo.save(row);
  }

  async summarize(projectId: string): Promise<UsageSummary> {
    const rows = await this.usageRepo.find({ where: { projectId } });
    const summary: UsageSummary = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      byModel: {},
      bySkill: {},
    };
    for (const row of rows) {
      summary.totalInputTokens += row.inputTokens;
      summary.totalOutputTokens += row.outputTokens;
      summary.totalCostUsd += row.estimatedCostUsd;
      const modelBucket = (summary.byModel[row.model] ??= {
        input: 0,
        output: 0,
        cost: 0,
      });
      modelBucket.input += row.inputTokens;
      modelBucket.output += row.outputTokens;
      modelBucket.cost += row.estimatedCostUsd;
      const skillKey = row.skillKey ?? 'unknown';
      const skillBucket = (summary.bySkill[skillKey] ??= {
        input: 0,
        output: 0,
        cost: 0,
      });
      skillBucket.input += row.inputTokens;
      skillBucket.output += row.outputTokens;
      skillBucket.cost += row.estimatedCostUsd;
    }
    return summary;
  }
}
