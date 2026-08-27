import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ArtifactCompilerService } from './artifact-compiler.service';
import { DocumentGeneratorService } from './document-generator.service';
import { COMPILER_DOCUMENT_TYPES, REQUIRED_KINDS, DOCUMENT_TYPE_MAP } from './compiler.types';
import { isCompilerDocumentType } from './compiler';

@Controller('foundation/compiler')
export class CompilerController {
  constructor(
    private readonly compiler: ArtifactCompilerService,
    private readonly generator: DocumentGeneratorService,
  ) {}

  @Get('types')
  types() {
    return {
      documentTypes: COMPILER_DOCUMENT_TYPES,
      requiredKinds: REQUIRED_KINDS,
      persistedDocumentTypes: DOCUMENT_TYPE_MAP,
    };
  }

  /** Deterministic compile + persist (new document version). */
  @Post('projects/:projectId/compile')
  compile(
    @Param('projectId') projectId: string,
    @Body()
    body: {
      documentType: string;
      source?: 'canonical' | 'knowledge' | 'both';
      refine?: boolean;
      createVersion?: boolean;
      triggerEvent?: string;
      changeSummary?: string;
    },
  ) {
    if (!isCompilerDocumentType(body.documentType)) {
      return { error: 'unsupported document type', supported: COMPILER_DOCUMENT_TYPES };
    }
    return this.generator.generate(projectId, body.documentType, {
      source: body.source,
      refine: body.refine,
      createVersion: body.createVersion,
      triggerEvent: body.triggerEvent,
      changeSummary: body.changeSummary,
    });
  }

  /** Dry-run: compile without persisting. */
  @Post('projects/:projectId/dry-run')
  dryRun(
    @Param('projectId') projectId: string,
    @Body() body: { documentType: string; source?: 'canonical' | 'knowledge' | 'both' },
  ) {
    if (!isCompilerDocumentType(body.documentType)) {
      return { error: 'unsupported document type', supported: COMPILER_DOCUMENT_TYPES };
    }
    return this.generator.preview(projectId, body.documentType, { source: body.source });
  }
}
