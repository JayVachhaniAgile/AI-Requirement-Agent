import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Project, ProjectVersion } from '../../database/entities';

export interface ProjectSnapshot {
  projectId: string;
  name: string;
  idea: string;
  status: string;
  knowledgeItemCount: number;
  artifactTypes: string[];
  generatedAt: string;
}

export interface CreateProjectVersionInput {
  reason?: string;
  createdBy?: string;
  metadata?: Record<string, unknown>;
  /** Optional explicit snapshot; computed from live state when omitted. */
  snapshot?: ProjectSnapshot;
  /** When set, the version number is forced (used for backfills). */
  version?: number;
}

/**
 * Canonical Project Model (new architecture).
 *
 * Creates immutable project versions — the pinned input for context engine,
 * artifact dependency graph and workflow executions. Read-only with respect
 * to the existing project lifecycle; the legacy `projects` table is untouched.
 */
@Injectable()
export class ProjectVersionService {
  private readonly logger = new Logger(ProjectVersionService.name);

  constructor(
    @InjectRepository(ProjectVersion)
    private readonly versionRepo: Repository<ProjectVersion>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
  ) {}

  async buildSnapshot(projectId: string): Promise<ProjectSnapshot> {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException(`Project '${projectId}' not found`);
    }
    return {
      projectId: project.id,
      name: project.name,
      idea: project.idea,
      status: project.status,
      knowledgeItemCount: 0,
      artifactTypes: [],
      generatedAt: new Date().toISOString(),
    };
  }

  async createVersion(
    projectId: string,
    input: CreateProjectVersionInput = {},
  ): Promise<ProjectVersion> {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException(`Project '${projectId}' not found`);
    }

    const latest = await this.versionRepo
      .createQueryBuilder('pv')
      .where('pv.projectId = :projectId', { projectId })
      .orderBy('pv.version', 'DESC')
      .getOne();

    const version = input.version ?? (latest ? latest.version + 1 : 1);
    const snapshot = input.snapshot ?? (await this.buildSnapshot(projectId));

    const row = this.versionRepo.create({
      id: randomUUID(),
      projectId,
      version,
      reason: input.reason ?? null,
      snapshotJson: JSON.stringify(snapshot),
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      createdBy: input.createdBy ?? null,
    });
    const saved = await this.versionRepo.save(row);
    this.logger.log(`Project ${projectId} version ${version} created`);
    return saved;
  }

  listVersions(projectId: string): Promise<ProjectVersion[]> {
    return this.versionRepo.find({
      where: { projectId },
      order: { version: 'DESC' },
    });
  }

  async getVersion(projectId: string, version: number): Promise<ProjectVersion> {
    const row = await this.versionRepo.findOne({ where: { projectId, version } });
    if (!row) {
      throw new NotFoundException(
        `Project '${projectId}' has no version ${version}`,
      );
    }
    return row;
  }
}
