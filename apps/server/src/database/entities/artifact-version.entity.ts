import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';

/** Immutable snapshot of an artifact at a specific version. */
@Entity('artifact_versions')
@Unique(['artifactId', 'version'])
@Index(['projectId'])
@Index(['artifactId'])
export class ArtifactVersion {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  artifactId: string;

  /** Denormalized for project-scoped queries and cascades. */
  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'varchar', length: 50, default: 'DRAFT' })
  status: string;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ type: 'real', nullable: true })
  confidence: number | null;

  /** Free-form JSON metadata (prompt/schema versions, actor). */
  @Column({ type: 'text', nullable: true })
  metadata: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  createdBy: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
