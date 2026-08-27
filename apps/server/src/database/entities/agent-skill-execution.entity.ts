import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Execution record for a skill (new architecture).
 *
 * Sits alongside the legacy `agent_executions` table, which is intentionally
 * left untouched. Each row links a skill to a workflow execution and records
 * tokens/status; model usage is persisted separately in `model_usage`.
 */
@Entity('agent_skill_executions')
@Index(['projectId'])
@Index(['skillId'])
@Index(['workflowExecutionId'])
export class AgentSkillExecution {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'uuid', nullable: true })
  skillId: string | null;

  @Column({ type: 'varchar', length: 100 })
  skillKey: string;

  @Column({ type: 'uuid', nullable: true })
  workflowExecutionId: string | null;

  /** QUEUED | RUNNING | COMPLETED | FAILED | SKIPPED */
  @Column({ type: 'varchar', length: 32, default: 'RUNNING' })
  status: string;

  @Column({ type: 'int', default: 0 })
  inputTokens: number;

  @Column({ type: 'int', default: 0 })
  outputTokens: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  model: string | null;

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @Column({ type: 'real', nullable: true })
  confidence: number | null;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  /** Free-form JSON metadata. */
  @Column({ type: 'text', nullable: true })
  metadata: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
