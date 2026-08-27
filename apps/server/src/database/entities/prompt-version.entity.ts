import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

/** Immutable prompt version record (P2-4 traceability). */
@Entity('prompt_versions')
export class PromptVersion {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'varchar', length: 100 })
  @Index()
  promptKey: string;

  @Column({ type: 'varchar', length: 64 })
  version: string;

  @Column({ type: 'varchar', length: 32 })
  contentHash: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  schemaVersion: string | null;

  @Column({ type: 'text', nullable: true })
  diff: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  createdBy: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
