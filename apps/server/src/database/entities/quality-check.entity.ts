import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/** Result of a quality gate run (new architecture). */
@Entity('quality_checks')
@Index(['projectId'])
@Index(['workflowExecutionId'])
export class QualityCheck {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'uuid', nullable: true })
  workflowExecutionId: string | null;

  @Column({ type: 'uuid', nullable: true })
  artifactId: string | null;

  /** Gate key, e.g. `knowledge-coverage`, `id-integrity`. */
  @Column({ type: 'varchar', length: 100 })
  gateKey: string;

  /** PASS | FAIL | ERROR | PENDING */
  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  status: string;

  /** critical | high | medium | low */
  @Column({ type: 'varchar', length: 16, nullable: true })
  severity: string | null;

  /** 0-100 when the gate produces a score. */
  @Column({ type: 'real', nullable: true })
  score: number | null;

  /** Serialized JSON array of findings. */
  @Column({ type: 'text', nullable: true })
  findings: string | null;

  @Column({ type: 'timestamp', nullable: true })
  checkedAt: Date | null;

  /** Free-form JSON metadata. */
  @Column({ type: 'text', nullable: true })
  metadata: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
