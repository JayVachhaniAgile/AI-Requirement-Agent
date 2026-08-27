import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('gap_analysis_runs')
export class GapAnalysisRun {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'int' })
  iteration: number;

  @Column({ type: 'int', default: 0 })
  coveragePct: number;

  @Column({ type: 'int', default: 0 })
  qualityScore: number;

  @Column({ type: 'int', default: 0 })
  totalGaps: number;

  @Column({ type: 'int', default: 0 })
  resolvedGaps: number;

  @Column({ type: 'int', default: 0 })
  remainingGaps: number;

  @Column({ type: 'varchar', length: 50, default: 'COMPLETED' })
  status: string;

  /** JSON snapshot of this iteration's findings. */
  @Column({ type: 'text', nullable: true })
  findingsJson: string | null;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  /** JSON array of document types regenerated this iteration. */
  @Column({ type: 'text', nullable: true })
  documentsUpdatedJson: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
