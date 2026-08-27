import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * A single gap waiting for user review. Each proposal maps to exactly one
 * finding; nothing is merged into the real documents until the user applies
 * it. Applying generates a targeted patch for the affected section only.
 */
@Entity('gap_analysis_proposals')
export class GapAnalysisProposal {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'int' })
  iteration: number;

  @Column({ type: 'varchar', length: 100 })
  documentType: string;

  /** Section/heading within the document that the gap affects. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  section: string | null;

  /** Optional confidence score (0-100) from the analysis. */
  @Column({ type: 'int', nullable: true })
  confidence: number | null;

  @Column({ type: 'text', nullable: true })
  existingContent: string | null;

  /** Merged document content after the user applies the proposal. */
  @Column({ type: 'text', nullable: true })
  proposedContent: string | null;

  /** The single finding: [{finding, explanation, severity, section, confidence, suggestion}]. */
  @Column({ type: 'text', nullable: true })
  reasonsJson: string | null;

  /** PENDING | APPLIED | REJECTED | DISCARDED */
  @Column({ type: 'varchar', length: 50, default: 'PENDING' })
  status: string;

  @Column({ type: 'timestamp', nullable: true })
  appliedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
