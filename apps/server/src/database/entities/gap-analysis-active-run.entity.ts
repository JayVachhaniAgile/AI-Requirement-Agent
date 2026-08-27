import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Live state of the currently running (or last) gap-analysis engine run, so
 * progress survives page refreshes and clients can poll realtime updates.
 */
@Entity('gap_analysis_active_runs')
export class GapAnalysisActiveRun {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid', unique: true })
  projectId: string;

  @Column({ type: 'varchar', length: 50, default: 'RUNNING' })
  status: string;

  /** Latest analysis iteration completed (resume point after review). */
  @Column({ type: 'int', default: 0 })
  iteration: number;

  /** Human-readable phase: starting | analyzing | regenerating | completed | failed. */
  @Column({ type: 'varchar', length: 100, default: 'starting' })
  phase: string;

  /** Detail such as the iteration number or document being merged. */
  @Column({ type: 'text', nullable: true })
  phaseDetail: string | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
