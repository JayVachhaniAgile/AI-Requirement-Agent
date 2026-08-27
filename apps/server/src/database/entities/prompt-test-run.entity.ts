import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

/** Result of a prompt self-test / snapshot run. */
@Entity('prompt_test_runs')
export class PromptTestRun {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'varchar', length: 100 })
  promptKey: string;

  @Column({ type: 'varchar', length: 64 })
  version: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sampleKey: string | null;

  @Column({ type: 'varchar', length: 32 })
  result: string;

  @Column({ type: 'text', nullable: true })
  assertionsJson: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
