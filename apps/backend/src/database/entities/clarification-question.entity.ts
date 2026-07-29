import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('clarification_questions')
export class ClarificationQuestion {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'text', nullable: true })
  context: string | null;

  @Column({ type: 'boolean', default: false })
  isBlocking: boolean;

  @Column({ type: 'varchar', length: 50, default: 'PENDING' })
  status: string;

  @Column({ type: 'text', nullable: true })
  answer: string | null;

  @Column({ type: 'timestamp', nullable: true })
  answeredAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
