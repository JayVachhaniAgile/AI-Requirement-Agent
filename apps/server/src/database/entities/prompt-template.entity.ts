import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/** Author-time prompt template snapshot, persisted for audit/debug. */
@Entity('prompt_templates')
export class PromptTemplate {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'varchar', length: 100 })
  @Index({ unique: true })
  promptKey: string;

  @Column({ type: 'varchar', length: 32 })
  kind: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', length: 32 })
  contentHash: string;

  @Column({ type: 'text', nullable: true })
  variablesJson: string | null;

  @Column({ type: 'text', nullable: true })
  metadata: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
