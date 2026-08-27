import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Artifact (new architecture): the canonical persisted output of a skill or
 * workflow stage. One row per artifact type within a project; the current
 * content lives on this row while the full history lives in `artifact_versions`.
 */
@Entity('artifacts')
@Index(['projectId', 'type'])
@Index(['projectId', 'status'])
export class Artifact {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  /** e.g. `FRD_DOCUMENT`, `KNOWLEDGE_ITEM`, `COMPILED_DOCUMENT`. */
  @Column({ type: 'varchar', length: 100 })
  type: string;

  /** Logical key inside the project (e.g. `frd`, `compiled`). */
  @Column({ type: 'varchar', length: 200, nullable: true })
  key: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  title: string | null;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  /** Current content (markdown or serialized JSON). */
  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ type: 'varchar', length: 50, default: 'DRAFT' })
  status: string;

  /** Latest version number; every change bumps it (mirrors artifact_versions). */
  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'real', nullable: true })
  confidence: number | null;

  /** Producing skill/agent key (e.g. `requirements-engineering`). */
  @Column({ type: 'varchar', length: 100, nullable: true })
  source: string | null;

  /** Source version (e.g. skill `v1.2-<hash8>`). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  sourceVersion: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  createdBy: string | null;

  /** Free-form JSON metadata. */
  @Column({ type: 'text', nullable: true })
  metadata: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
