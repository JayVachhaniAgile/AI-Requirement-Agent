import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/** One execution of a DAG definition for a project. */
@Entity('workflow_dag_runs')
export class WorkflowDagRun {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  projectId: string;

  @Column({ type: 'varchar', length: 100 })
  definitionKey: string;

  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  status: string;

  @Column({ type: 'int', default: 0 })
  currentLevel: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  currentNodeKey: string | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
