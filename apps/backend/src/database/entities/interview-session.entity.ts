import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('interview_sessions')
export class InterviewSessionEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'varchar', length: 500 })
  projectName: string;

  @Column({ type: 'text', default: '' })
  idea: string;

  @Column({ type: 'jsonb', default: [] })
  history: Array<{ role: 'ai' | 'user'; content: string }>;

  @Column({ type: 'varchar', length: 50, default: 'in_progress' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
