import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Live working value of a Project Context item. Items are keyed by
 * (project_id, domain, external_id) and versioned in place: every mutation
 * bumps `version` and snapshots the previous value into
 * `project_context_snapshots`.
 */
@Entity('project_context_items')
export class ProjectContextItem {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'varchar', length: 64 })
  domain: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  externalId: string | null;

  @Column({ type: 'varchar', length: 100 })
  type: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  producerAgent: string | null;

  @Column({ type: 'varchar', length: 32, default: 'DRAFT' })
  status: string;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'text', array: true, default: [] })
  relatedIds: string[];

  @Column({ type: 'text', nullable: true })
  metadata: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
