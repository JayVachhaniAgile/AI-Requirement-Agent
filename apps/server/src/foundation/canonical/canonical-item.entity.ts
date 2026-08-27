import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

/**
 * CanonicalItem — the persisted row for every structured project object.
 *
 * `payload` holds the JSON body (strongly typed by Zod at validation time,
 * persisted as JSONB). Provenance is also JSONB so the source taxonomy
 * remains queryable for the new traceability surface.
 *
 * Versioning: every save with the same `(projectId, kind, externalId)`
 * bumps `version`. A frozen snapshot is written to `canonical_item_versions`
 * on every save so we can answer "where did this requirement come from?"
 * even after later edits.
 */
@Entity('canonical_items')
@Unique(['projectId', 'kind', 'externalId'])
@Index(['projectId', 'kind'])
@Index(['projectId', 'status'])
export class CanonicalItem {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'varchar', length: 64 })
  kind: string;

  @Column({ type: 'varchar', length: 100 })
  externalId: string;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ type: 'varchar', length: 32, default: 'DRAFT' })
  status: string;

  @Column({ type: 'int', default: 1 })
  version: number;

  /** Confidence (0-100) — nullable for objects that do not require it. */
  @Column({ type: 'int', nullable: true })
  confidence: number | null;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  provenance: Record<string, unknown>;

  @Column({ type: 'varchar', length: 100, nullable: true })
  createdBy: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('canonical_item_versions')
@Unique(['itemId', 'version'])
@Index(['projectId', 'kind'])
export class CanonicalItemVersion {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  itemId: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'varchar', length: 64 })
  kind: string;

  @Column({ type: 'varchar', length: 100 })
  externalId: string;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'varchar', length: 32, default: 'DRAFT' })
  status: string;

  @Column({ type: 'int', nullable: true })
  confidence: number | null;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  provenance: Record<string, unknown>;

  @Column({ type: 'varchar', length: 100, nullable: true })
  createdBy: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
