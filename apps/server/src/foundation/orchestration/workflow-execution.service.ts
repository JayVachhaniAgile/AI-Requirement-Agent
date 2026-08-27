import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  AgentSkillExecution,
  WorkflowExecution,
} from '../../database/entities';
import {
  EXECUTION_STATUS,
  WORKFLOW_EXECUTION_STATUS,
} from '../common/foundation-status';

export interface StartWorkflowInput {
  projectId: string;
  projectVersionId?: string;
  metadata?: Record<string, unknown>;
}

export interface StartSkillExecutionInput {
  projectId: string;
  skillKey: string;
  skillId?: string;
  workflowExecutionId?: string;
  metadata?: Record<string, unknown>;
}

export interface CompleteSkillExecutionInput {
  status?: 'COMPLETED' | 'FAILED' | 'SKIPPED';
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  retryCount?: number;
  confidence?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Workflow Execution (new architecture).
 *
 * Persistence for the new workflow runner. Tracks per-workflow and per-skill
 * runs; the legacy `workflow_steps` / `agent_executions` tables stay
 * untouched so existing analytics, retries and WebSocket events keep working.
 */
@Injectable()
export class WorkflowExecutionService {
  private readonly logger = new Logger(WorkflowExecutionService.name);

  constructor(
    @InjectRepository(WorkflowExecution)
    private readonly workflowRepo: Repository<WorkflowExecution>,
    @InjectRepository(AgentSkillExecution)
    private readonly skillExecRepo: Repository<AgentSkillExecution>,
  ) {}

  async startWorkflow(input: StartWorkflowInput): Promise<WorkflowExecution> {
    const row = this.workflowRepo.create({
      id: randomUUID(),
      projectId: input.projectId,
      status: WORKFLOW_EXECUTION_STATUS.RUNNING,
      currentStage: null,
      projectVersionId: input.projectVersionId ?? null,
      startedAt: new Date(),
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    });
    const saved = await this.workflowRepo.save(row);
    this.logger.log(`Workflow execution ${saved.id} started for ${input.projectId}`);
    return saved;
  }

  async completeWorkflow(
    id: string,
    status: 'COMPLETED' | 'FAILED' | 'CANCELLED',
    error?: string,
  ): Promise<WorkflowExecution> {
    const row = await this.workflowRepo.findOne({ where: { id } });
    if (!row) throw new Error(`Workflow execution '${id}' not found`);
    row.status = status;
    row.completedAt = new Date();
    row.currentStage = null;
    row.error = error ?? null;
    return this.workflowRepo.save(row);
  }

  async setStage(workflowExecutionId: string, stage: string): Promise<void> {
    await this.workflowRepo.update(workflowExecutionId, { currentStage: stage });
  }

  async listWorkflows(projectId: string): Promise<WorkflowExecution[]> {
    return this.workflowRepo.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
    });
  }

  async startSkillExecution(
    input: StartSkillExecutionInput,
  ): Promise<AgentSkillExecution> {
    const row = this.skillExecRepo.create({
      id: randomUUID(),
      projectId: input.projectId,
      skillId: input.skillId ?? null,
      skillKey: input.skillKey,
      workflowExecutionId: input.workflowExecutionId ?? null,
      status: EXECUTION_STATUS.RUNNING,
      startedAt: new Date(),
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    });
    return this.skillExecRepo.save(row);
  }

  async completeSkillExecution(
    id: string,
    input: CompleteSkillExecutionInput = {},
  ): Promise<AgentSkillExecution> {
    const row = await this.skillExecRepo.findOne({ where: { id } });
    if (!row) throw new Error(`Skill execution '${id}' not found`);
    row.status = input.status ?? EXECUTION_STATUS.COMPLETED;
    row.inputTokens = input.inputTokens ?? row.inputTokens;
    row.outputTokens = input.outputTokens ?? row.outputTokens;
    row.model = input.model ?? row.model;
    row.retryCount = input.retryCount ?? row.retryCount;
    row.confidence = input.confidence ?? row.confidence;
    row.error = input.error ?? row.error;
    row.completedAt = new Date();
    if (input.metadata) {
      const merged = {
        ...(row.metadata ? JSON.parse(row.metadata) : {}),
        ...input.metadata,
      };
      row.metadata = JSON.stringify(merged);
    }
    return this.skillExecRepo.save(row);
  }

  async listSkillExecutions(
    workflowExecutionId: string,
  ): Promise<AgentSkillExecution[]> {
    return this.skillExecRepo.find({
      where: { workflowExecutionId },
      order: { createdAt: 'ASC' },
    });
  }
}
