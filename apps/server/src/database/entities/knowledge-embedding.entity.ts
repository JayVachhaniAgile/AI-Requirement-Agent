import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Optional semantic embeddings for knowledge items. `embedding` stores the
 * vector as a JSON array of numbers (text column) so no pgvector extension is
 * required; swapping to `vector(1536)` is a column-type change when deployed
 * on PostgreSQL with pgvector.
 */
@Entity('knowledge_embeddings')
export class KnowledgeEmbedding {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  @Index({ unique: true })
  itemId: string;

  @Column({ type: 'varchar', length: 64 })
  model: string;

  @Column({ type: 'text', nullable: true })
  embedding: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;
}
