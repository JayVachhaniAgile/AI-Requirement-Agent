import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('document_versions')
export class DocumentVersion {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  /** The document type this version belongs to (e.g. FRD_DOCUMENT). */
  @Column({ type: 'varchar', length: 100, default: 'COMPILED_DOCUMENT' })
  documentType: string;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'text' })
  markdownContent: string;

  @Column({ type: 'text', nullable: true })
  changeSummary: string | null;

  @Column({ type: 'text', array: true, default: [] })
  affectedItemIds: string[];

  @Column({ type: 'varchar', length: 100, nullable: true })
  triggerEvent: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
