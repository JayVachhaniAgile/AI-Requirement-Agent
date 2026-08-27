import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * Append-only audit trail of every Project Context mutation. One row per
 * commit; `metadata` carries prompt/schema versions and conflict resolution
 * outcomes for full traceability.
 */
@Entity('project_context_commits')
export class ProjectContextCommit {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  actorKey: string | null;

  @Column({ type: 'varchar', length: 32, default: 'agent' })
  actorType: string;

  @Column({ type: 'varchar', length: 32 })
  changeType: string;

  @Column({ type: 'text', array: true, default: [] })
  affectedItemIds: string[];

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'text', nullable: true })
  metadata: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
