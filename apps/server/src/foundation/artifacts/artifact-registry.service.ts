import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  Artifact,
  ArtifactVersion,
  ArtifactDependency,
} from '../../database/entities';
import {
  buildAdjacency,
  layerGraph,
  reachableDownstream,
  reachableUpstream,
  wouldCreateCycle,
  type ArtifactEdge,
} from './artifact-graph';

export interface NewArtifactInput {
  projectId: string;
  type: string;
  key?: string;
  title?: string;
  summary?: string;
  content?: string;
  status?: string;
  source?: string;
  sourceVersion?: string;
  createdBy?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface NewArtifactVersionInput {
  status?: string;
  content?: string;
  summary?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
  createdBy?: string;
}

export interface AddDependencyInput {
  sourceArtifactId: string;
  targetArtifactId: string;
  relation: string;
  weight?: number;
  producer?: string;
  metadata?: Record<string, unknown>;
}

export interface ImpactReport {
  artifactId: string;
  downstream: string[];
  upstream: string[];
  depth: number;
}

/**
 * Artifact registry (new architecture).
 *
 * Persists artifacts, their immutable versions, and the typed dependency
 * graph. Backed by the existing relational database (no graph DB); BFS
 * traversal lives in `artifact-graph.ts`.
 */
@Injectable()
export class ArtifactRegistryService {
  private readonly logger = new Logger(ArtifactRegistryService.name);

  constructor(
    @InjectRepository(Artifact)
    private readonly artifactRepo: Repository<Artifact>,
    @InjectRepository(ArtifactVersion)
    private readonly versionRepo: Repository<ArtifactVersion>,
    @InjectRepository(ArtifactDependency)
    private readonly depRepo: Repository<ArtifactDependency>,
  ) {}

  // -------- artifacts --------

  async upsertArtifact(input: NewArtifactInput): Promise<Artifact> {
    const existing = input.key
      ? await this.artifactRepo.findOne({
          where: { projectId: input.projectId, type: input.type, key: input.key },
        })
      : null;

    if (existing) {
      existing.title = input.title ?? existing.title;
      existing.summary = input.summary ?? existing.summary;
      existing.content = input.content ?? existing.content;
      if (input.status) existing.status = input.status;
      existing.source = input.source ?? existing.source;
      existing.sourceVersion = input.sourceVersion ?? existing.sourceVersion;
      existing.createdBy = input.createdBy ?? existing.createdBy;
      existing.confidence = input.confidence ?? existing.confidence;
      existing.metadata = input.metadata
        ? JSON.stringify(input.metadata)
        : existing.metadata;
      return this.artifactRepo.save(existing);
    }

    const row = this.artifactRepo.create({
      id: randomUUID(),
      projectId: input.projectId,
      type: input.type,
      key: input.key ?? null,
      title: input.title ?? null,
      summary: input.summary ?? null,
      content: input.content ?? null,
      status: input.status ?? 'DRAFT',
      version: 1,
      source: input.source ?? null,
      sourceVersion: input.sourceVersion ?? null,
      createdBy: input.createdBy ?? null,
      confidence: input.confidence ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    });
    const saved = await this.artifactRepo.save(row);
    await this.recordVersion(saved, {
      status: saved.status ?? undefined,
      content: saved.content ?? undefined,
      summary: saved.summary ?? undefined,
      confidence: saved.confidence ?? undefined,
      createdBy: saved.createdBy ?? undefined,
      metadata: input.metadata,
    });
    return saved;
  }

  async publishNewVersion(
    artifactId: string,
    input: NewArtifactVersionInput = {},
  ): Promise<Artifact> {
    const artifact = await this.artifactRepo.findOne({ where: { id: artifactId } });
    if (!artifact) {
      throw new NotFoundException(`Artifact '${artifactId}' not found`);
    }
    const nextVersion = artifact.version + 1;
    artifact.summary = input.summary ?? artifact.summary;
    artifact.content = input.content ?? artifact.content;
    artifact.status = input.status ?? artifact.status;
    artifact.confidence = input.confidence ?? artifact.confidence;
    artifact.version = nextVersion;
    const saved = await this.artifactRepo.save(artifact);
    await this.recordVersion(saved, input);
    return saved;
  }

  private async recordVersion(
    artifact: Artifact,
    input: NewArtifactVersionInput,
  ): Promise<ArtifactVersion> {
    const row = this.versionRepo.create({
      id: randomUUID(),
      artifactId: artifact.id,
      projectId: artifact.projectId,
      version: artifact.version,
      status: input.status ?? artifact.status,
      content: input.content ?? artifact.content,
      summary: input.summary ?? artifact.summary,
      confidence: input.confidence ?? artifact.confidence,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      createdBy: input.createdBy ?? artifact.createdBy,
    });
    return this.versionRepo.save(row);
  }

  listByProject(projectId: string, type?: string): Promise<Artifact[]> {
    return this.artifactRepo.find({
      where: type ? { projectId, type } : { projectId },
      order: { createdAt: 'ASC' },
    });
  }

  listVersions(artifactId: string): Promise<ArtifactVersion[]> {
    return this.versionRepo.find({
      where: { artifactId },
      order: { version: 'ASC' },
    });
  }

  getById(projectId: string, id: string): Promise<Artifact> {
    return this.artifactRepo.findOne({ where: { id, projectId } }).then((row) => {
      if (!row) throw new NotFoundException(`Artifact '${id}' not found`);
      return row;
    });
  }

  // -------- dependency graph --------

  async addDependency(input: AddDependencyInput): Promise<ArtifactDependency> {
    if (input.sourceArtifactId === input.targetArtifactId) {
      throw new BadRequestException(
        'Artifact dependencies cannot be self-referential',
      );
    }
    const edges = await this.depRepo.find();
    if (
      wouldCreateCycle(
        edges as unknown as ArtifactEdge[],
        input.sourceArtifactId,
        input.targetArtifactId,
      )
    ) {
      throw new BadRequestException(
        `Dependency would create a cycle: ${input.sourceArtifactId} -> ${input.targetArtifactId}`,
      );
    }
    const existing = await this.depRepo.findOne({
      where: {
        sourceArtifactId: input.sourceArtifactId,
        targetArtifactId: input.targetArtifactId,
        relation: input.relation,
      },
    });
    if (existing) return existing;

    const projectId = await this.getProjectIdForArtifact(input.sourceArtifactId);
    const row = this.depRepo.create({
      id: randomUUID(),
      projectId,
      sourceArtifactId: input.sourceArtifactId,
      targetArtifactId: input.targetArtifactId,
      relation: input.relation,
      weight: input.weight ?? 1,
      producer: input.producer ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    });
    return this.depRepo.save(row);
  }

  private async getProjectIdForArtifact(artifactId: string): Promise<string> {
    const artifact = await this.artifactRepo.findOne({ where: { id: artifactId } });
    if (!artifact) {
      throw new NotFoundException(`Artifact '${artifactId}' not found`);
    }
    return artifact.projectId;
  }

  listDependencies(projectId: string): Promise<ArtifactDependency[]> {
    return this.depRepo.find({ where: { projectId } });
  }

  /** Layers of the project graph; throws on cycles. */
  async planLayers(
    projectId: string,
  ): Promise<{ layers: string[][]; cyclic: boolean }> {
    const artifacts = await this.artifactRepo.find({ where: { projectId } });
    const edges = await this.depRepo.find({ where: { projectId } });
    return layerGraph(
      edges as unknown as ArtifactEdge[],
      artifacts.map((a) => a.id),
    );
  }

  async impactReport(
    projectId: string,
    artifactId: string,
    maxDepth = 5,
  ): Promise<ImpactReport> {
    const edges = await this.depRepo.find({ where: { projectId } });
    return {
      artifactId,
      downstream: [
        ...reachableDownstream(
          edges as unknown as ArtifactEdge[],
          artifactId,
          maxDepth,
        ),
      ],
      upstream: [
        ...reachableUpstream(
          edges as unknown as ArtifactEdge[],
          artifactId,
          maxDepth,
        ),
      ],
      depth: maxDepth,
    };
  }

  /** Re-export for tests / consumers that only have access to the service. */
  buildAdjacency(edges: ArtifactEdge[]) {
    return buildAdjacency(edges);
  }
}
