import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';

/**
 * Directed typed edge between two artifacts (new architecture).
 *
 * Implemented on the existing relational database — no graph database is
 * introduced. Traversal is done in application code (BFS over adjacency).
 */
@Entity('artifact_dependencies')
@Unique(['sourceArtifactId', 'targetArtifactId', 'relation'])
@Index(['projectId'])
@Index(['sourceArtifactId'])
@Index(['targetArtifactId'])
export class ArtifactDependency {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'uuid' })
  sourceArtifactId: string;

  @Column({ type: 'uuid' })
  targetArtifactId: string;

  /** Edge taxonomy: `depends_on`, `refines`, `satisfies`, `drives`, ... */
  @Column({ type: 'varchar', length: 64 })
  relation: string;

  @Column({ type: 'real', default: 1 })
  weight: number;

  /** Who recorded this edge (skill key / user / system). */
  @Column({ type: 'varchar', length: 100, nullable: true })
  producer: string | null;


  @Column({ type: 'real', nullable: true })
  confidence: number | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  sourceReference: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  createdBy: string | null;

  /** Free-form JSON metadata. */
  @Column({ type: 'text', nullable: true })
  metadata: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
