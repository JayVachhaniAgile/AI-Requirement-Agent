import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('knowledge_items')
export class KnowledgeItem {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  externalId: string | null;

  @Column({ type: 'varchar', length: 100 })
  type: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 50, default: 'DRAFT' })
  status: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  source: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  createdBy: string | null;

  @Column({ type: 'text', nullable: true })
  metadata: string | null;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'text', array: true, default: [] })
  relatedIds: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
