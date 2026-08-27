import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * Immutable point-in-time copy of a context item, written before every
 * mutation. The live row always holds the newest value; history lives here.
 */
@Entity('project_context_snapshots')
export class ProjectContextSnapshot {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  itemId: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'text' })
  snapshotJson: string;

  @Column({ type: 'text', nullable: true })
  changeSummary: string | null;

  @Column({ type: 'uuid', nullable: true })
  commitId: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  triggerEvent: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
