import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

@Entity('documents')
@Unique(['projectId', 'documentType'])
@Index(['projectId', 'documentType'])
export class Document {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'varchar', length: 50, default: 'DRAFT' })
  status: string;

  @Column({ type: 'text', nullable: true })
  markdownContent: string | null;

  @Column({ type: 'text', nullable: true })
  validationScore: string | null;

  @Column({ type: 'varchar', length: 50, default: 'COMPILED_DOCUMENT' })
  documentType: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
