import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('projects')
export class Project {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'varchar', length: 500 })
  name: string;

  @Column({ type: 'text' })
  idea: string;

  @Column({ type: 'varchar', length: 50, default: 'CREATED' })
  status: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  currentStage: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true })
  domain: string | null;


  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
