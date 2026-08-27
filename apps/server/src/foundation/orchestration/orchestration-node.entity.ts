import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

/** Per-node execution state inside an orchestration plan. */
@Entity('orchestration_nodes')
@Unique(['planId', 'nodeId'])
@Index(['planId'])
@Index(['projectId'])
export class OrchestrationNodeEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  planId: string;

  @Column({ type: 'uuid' })
  projectId: string;

  /** Node id (skill key). */
  @Column({ type: 'varchar', length: 100 })
  nodeId: string;

  @Column({ type: 'varchar', length: 100 })
  skillKey: string;

  /** PLANNED|QUEUED|RUNNING|WAITING|COMPLETED|FAILED|BLOCKED|CANCELLED|RETRYING */
  @Column({ type: 'varchar', length: 32, default: 'PLANNED' })
  status: string;

  @Column({ type: 'int', default: 0 })
  level: number;

  @Column({ type: 'boolean', default: true })
  required: boolean;

  @Column({ type: 'boolean', default: false })
  checkpoint: boolean;

  @Column({ type: 'varchar', length: 16, nullable: true })
  approvalType: string | null;

  /** PENDING | APPROVED | REJECTED — when checkpoint is true. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  approvalStatus: string | null;

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @Column({ type: 'int', default: 2 })
  maxRetries: number;

  @Column({ type: 'boolean', default: false })
  reused: boolean;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  /** Serialized node output. */
  @Column({ type: 'text', nullable: true })
  outputJson: string | null;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
