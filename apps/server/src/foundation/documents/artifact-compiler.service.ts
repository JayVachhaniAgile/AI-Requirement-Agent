import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CanonicalItem } from '../canonical/canonical-item.entity';
import { KnowledgeItem } from '../../database/entities';
import { ArtifactDependencyService } from '../artifacts/artifact-dependency.service';
import { compileDocument } from './compiler';
import type {
  CompilationWarning,
  CompiledDocument,
  CompilerArtifact,
  CompilerDependencyEdge,
  CompilerDocumentType,
} from './compiler.types';

export interface CompileOptions {
  /** canonical | knowledge | both — knowledge fallback for pre-canonical projects. */
  source?: 'canonical' | 'knowledge' | 'both';
  includeProvenance?: boolean;
  includeMetadata?: boolean;
  includeTraceability?: boolean;
}

/**
 * ArtifactCompilerService (Phase 9) — retrieves canonical artifacts,
 * resolves dependencies, validates completeness and compiles documents.
 * Persistence/versioning is handled by DocumentGeneratorService.
 */
@Injectable()
export class ArtifactCompilerService {
  private readonly logger = new Logger(ArtifactCompilerService.name);

  constructor(
    @InjectRepository(CanonicalItem)
    private readonly canonicalRepo: Repository<CanonicalItem>,
    @InjectRepository(KnowledgeItem)
    private readonly kiRepo: Repository<KnowledgeItem>,
    private readonly dependencies: ArtifactDependencyService,
  ) {}

  async compile(
    projectId: string,
    documentType: CompilerDocumentType,
    options: CompileOptions = {},
  ): Promise<CompiledDocument> {
    const source = options.source ?? 'canonical';
    const artifacts = await this.loadArtifacts(projectId, source);
    const edges = await this.loadDependencies(projectId);
    const compiled = compileDocument({
      projectId,
      documentType,
      artifacts,
      dependencies: edges,
      options: {
        includeProvenance: options.includeProvenance,
        includeMetadata: options.includeMetadata,
        includeTraceability: options.includeTraceability,
      },
    });
    this.logger.log(
      `Compiled ${documentType} for project ${projectId}: ${artifacts.length} artifacts, ${compiled.warnings.length} warnings`,
    );
    return compiled;
  }

  /** Load canonical items (and optionally legacy knowledge items). */
  async loadArtifacts(projectId: string, source: 'canonical' | 'knowledge' | 'both'): Promise<CompilerArtifact[]> {
    const out: CompilerArtifact[] = [];
    if (source === 'canonical' || source === 'both') {
      const canonical = await this.canonicalRepo.find({ where: { projectId } });
      out.push(...canonical.map(toCompilerArtifact));
    }
    if (source === 'knowledge' || (source === 'both' && out.length === 0)) {
      const knowledge = await this.kiRepo.find({ where: { projectId } });
      out.push(...knowledge.map(toKnowledgeArtifact));
    }
    return out;
  }

  private async loadDependencies(projectId: string): Promise<CompilerDependencyEdge[]> {
    try {
      const edges = await this.dependencies.list(projectId);
      return edges.map((e) => ({
        sourceArtifactId: e.sourceArtifactId,
        targetArtifactId: e.targetArtifactId,
        relation: e.relation,
      }));
    } catch {
      return [];
    }
  }
}

function toCompilerArtifact(item: CanonicalItem): CompilerArtifact {
  return {
    externalId: item.externalId,
    kind: item.kind,
    title: item.title,
    summary: item.summary,
    body: item.payload,
    confidence: item.confidence,
    status: item.status,
    version: item.version,
    provenance: (item.provenance as CompilerArtifact['provenance']) ?? null,
  };
}

function toKnowledgeArtifact(item: KnowledgeItem): CompilerArtifact {
  return {
    externalId: item.externalId ?? item.id,
    kind: item.type,
    title: item.title,
    summary: item.description,
    body: { description: item.description, externalId: item.externalId },
    confidence: null,
    status: item.status,
    version: item.version,
    provenance: extractProvenance(item.metadata),
  };
}

function extractProvenance(metadata: string | null): CompilerArtifact['provenance'] {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata);
    if (parsed.provenance) return parsed.provenance;
    return null;
  } catch {
    return null;
  }
}

export type { CompilationWarning };
