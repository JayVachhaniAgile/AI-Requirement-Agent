import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Registered AI skill/capability (new architecture). */
@Entity('agent_skills')
export class AgentSkill {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  /** Stable skill key, e.g. `requirements-engineering` or `frd`. */
  @Column({ type: 'varchar', length: 100, unique: true })
  key: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 64, default: '1.0' })
  version: string;

  /** `high` | `standard` | `fast` — model tier used by the model router. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  modelTier: string | null;

  /** Serialized JSON Schema for the skill's input contract. */
  @Column({ type: 'text', nullable: true })
  inputSchema: string | null;

  /** Serialized JSON Schema for the skill's output contract. */
  @Column({ type: 'text', nullable: true })
  outputSchema: string | null;

  @Column({ type: 'boolean', default: true })
  supportsStructured: boolean;

  @Column({ type: 'int', nullable: true })
  maxTokens: number | null;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  /** DRAFT | ACTIVE | DEPRECATED */
  @Column({ type: 'varchar', length: 32, default: 'ACTIVE' })
  status: string;

  /** Free-form JSON metadata. */
  @Column({ type: 'text', nullable: true })
  metadata: string | null;


  /** Prompt template key (PromptBuilder registry). */
  @Column({ type: 'varchar', length: 200, nullable: true })
  promptKey: string | null;

  /** Required context domains (comma-separated names; empty = none). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  requiredContext: string | null;

  /** Artifact types this skill produces (comma-separated). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  producedArtifacts: string | null;

  /** Token budget override (separate from `maxTokens` which is the LLM output ceiling). */
  @Column({ type: 'int', nullable: true })
  tokenBudget: number | null;

  /** Quality gate keys to run after the skill produces output. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  qualityGates: string | null;

  /** Skill keys this skill depends on (execution must wait for them). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  dependencies: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
