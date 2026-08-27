import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Typed, directed edge between two `project_context_items`. Together with the
 * items (nodes) this forms the project knowledge graph. One row per assertion:
 * `(project_id, source_id, target_id, relation)` is unique — updates supersede
 * the previous weight/metadata rather than duplicating the edge.
 */
@Entity('knowledge_edges')
export class KnowledgeEdge {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  projectId: string;

  @Column({ type: 'uuid' })
  @Index()
  sourceId: string;

  @Column({ type: 'uuid' })
  @Index()
  targetId: string;

  @Column({ type: 'varchar', length: 64 })
  relation: string;

  @Column({ type: 'real', default: 1 })
  weight: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  producerAgent: string | null;

  @Column({ type: 'uuid', nullable: true })
  commitId: string | null;

  @Column({ type: 'text', nullable: true })
  metadata: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
