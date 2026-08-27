import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Persisted comparison between a legacy agent run and its new skill run
 * (Phase 6 shadow migration). Written during shadow/new mode; never changes
 * production project state.
 */
@Entity('agent_comparisons')
@Index(['projectId', 'agentKey'])
@Index(['agentKey', 'createdAt'])
export class AgentComparison {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'uuid', nullable: true })
  workflowExecutionId: string | null;

  @Column({ type: 'varchar', length: 100 })
  agentKey: string;

  @Column({ type: 'int', nullable: true })
  batch: number | null;

  /** legacy | shadow | new */
  @Column({ type: 'varchar', length: 16 })
  mode: string;

  @Column({ type: 'jsonb' })
  legacy: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  skill: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  metrics: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  verdict: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;
}
