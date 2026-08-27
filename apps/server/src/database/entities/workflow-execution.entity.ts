import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/** One run of the workflow for a project (new architecture). */
@Entity('workflow_executions')
@Index(['projectId'])
export class WorkflowExecution {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  /** PENDING | RUNNING | PAUSED | COMPLETED | FAILED | CANCELLED */
  @Column({ type: 'varchar', length: 32, default: 'RUNNING' })
  status: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  currentStage: string | null;

  /** Canonical model snapshot pinned at workflow start. */
  @Column({ type: 'uuid', nullable: true })
  projectVersionId: string | null;

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
