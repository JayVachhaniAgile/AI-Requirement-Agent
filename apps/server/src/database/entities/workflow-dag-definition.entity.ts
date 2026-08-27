import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/** Persisted DAG definition (audit copy of the static definitions). */
@Entity('workflow_dag_definitions')
export class WorkflowDagDefinition {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'varchar', length: 100 })
  @Index({ unique: true })
  key: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'text' })
  definitionJson: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
