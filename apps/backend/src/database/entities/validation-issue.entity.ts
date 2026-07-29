import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('validation_issues')
export class ValidationIssue {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  externalId: string | null;

  @Column({ type: 'varchar', length: 50 })
  severity: string;

  @Column({ type: 'varchar', length: 100 })
  category: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sourceAgent: string | null;

  @Column({ type: 'text', array: true, default: [] })
  affectedIds: string[];

  @Column({ type: 'text' })
  problem: string;

  @Column({ type: 'text', nullable: true })
  evidence: string | null;

  @Column({ type: 'text', nullable: true })
  impact: string | null;

  @Column({ type: 'text', nullable: true })
  recommendedCorrection: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  responsibleAgent: string | null;

  @Column({ type: 'boolean', default: false })
  requiresHumanDecision: boolean;

  @Column({ type: 'varchar', length: 50, default: 'OPEN' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
