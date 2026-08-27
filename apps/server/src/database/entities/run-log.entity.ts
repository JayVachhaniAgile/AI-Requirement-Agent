import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('run_logs')
export class RunLog {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'varchar', length: 100 })
  agentKey: string;

  /**
   * Event kind: `retry` | `parse_failure` | `validation_failure` | `padding` |
   * `low_confidence`.
   */
  @Column({ type: 'varchar', length: 50 })
  kind: string;

  @Column({ type: 'text' })
  message: string;

  /** Structured payload (e.g. finding codes, attempt number) as JSON. */
  @Column({ type: 'text', nullable: true })
  dataJson: string | null;

  /** P2-4: prompt + schema revision of the agent that produced this event. */
  @Column({ type: 'varchar', length: 50, nullable: true })
  promptVersion: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  schemaVersion: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
