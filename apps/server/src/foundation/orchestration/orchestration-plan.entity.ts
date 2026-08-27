import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Persisted orchestration plan (Phase 7). One row per plan; node state lives
 * in `orchestration_nodes`.
 */
@Entity('orchestration_plans')
@Index(['projectId'])
export class OrchestrationPlanEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'varchar', length: 200 })
  requestedOutcome: string;

  /** Serialized OrchestrationPlan JSON. */
  @Column({ type: 'jsonb' })
  plan: Record<string, unknown>;

  /** PLANNED | QUEUED | RUNNING | WAITING | COMPLETED | FAILED | CANCELLED */
  @Column({ type: 'varchar', length: 32, default: 'PLANNED' })
  status: string;

  @Column({ type: 'int', default: 0 })
  currentLevel: number;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
