import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/** Per-node execution state inside a DAG run. */
@Entity('workflow_dag_node_runs')
export class WorkflowDagNodeRun {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  runId: string;

  @Column({ type: 'varchar', length: 100 })
  @Index()
  nodeKey: string;

  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  status: string;

  @Column({ type: 'text', array: true, default: [] })
  dependsOn: string[];

  @Column({ type: 'boolean', default: true })
  required: boolean;

  @Column({ type: 'boolean', default: false })
  checkpoint: boolean;

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @Column({ type: 'int', default: 2 })
  maxRetries: number;

  @Column({ type: 'int', nullable: true })
  timeoutMs: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'text', nullable: true })
  outputJson: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
