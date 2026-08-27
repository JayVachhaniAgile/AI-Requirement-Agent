import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('discovery_checkpoints')
export class DiscoveryCheckpoint {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'text' })
  ideaInterpretation: string;

  @Column({ type: 'text' })
  problemStatement: string;

  @Column({ type: 'text' })
  proposedSolution: string;

  @Column({ type: 'text', nullable: true })
  initialScope: string | null;

  /** JSON snapshot of the discovery blocking questions at pause time. */
  @Column({ type: 'text', nullable: true })
  blockingQuestionsJson: string | null;

  @Column({ type: 'varchar', length: 50, default: 'PENDING' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
