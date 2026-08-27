import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';

/**
 * Canonical Project Model snapshot (new architecture).
 *
 * Each row is one immutable version of a project at a point in time:
 * the idea, the knowledge digest, and the artifact registry. Downstream
 * consumers (context engine, artifact dependency graph) can pin their inputs
 * to a specific version instead of reading mutable live state.
 */
@Entity('project_versions')
@Unique(['projectId', 'version'])
@Index(['projectId'])
export class ProjectVersion {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  /** 1-based version counter, scoped per project. */
  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  reason: string | null;

  /** Serialized canonical model snapshot (JSON). */
  @Column({ type: 'text', nullable: true })
  snapshotJson: string | null;

  /** Free-form JSON metadata (prompt/schema versions, actor context). */
  @Column({ type: 'text', nullable: true })
  metadata: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  createdBy: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
