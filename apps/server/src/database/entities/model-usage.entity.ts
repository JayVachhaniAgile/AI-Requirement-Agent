import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/** Token/cost tracking per LLM call (new architecture). */
@Entity('model_usage')
@Index(['projectId', 'createdAt'])
export class ModelUsage {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'uuid', nullable: true })
  workflowExecutionId: string | null;

  @Column({ type: 'uuid', nullable: true })
  skillExecutionId: string | null;

  /** Skill/agent key that produced the call. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  skillKey: string | null;

  @Column({ type: 'varchar', length: 100 })
  model: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  provider: string | null;

  /** Structured-output mode used: forced-tools | json-object | prompt-only. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  mode: string | null;

  @Column({ type: 'int', default: 0 })
  inputTokens: number;

  @Column({ type: 'int', default: 0 })
  outputTokens: number;

  @Column({ type: 'real', default: 0 })
  estimatedCostUsd: number;

  /** Free-form JSON metadata. */
  @Column({ type: 'text', nullable: true })
  metadata: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
