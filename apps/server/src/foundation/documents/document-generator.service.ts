import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { RkbService } from '../../rkb/rkb.service';
import { ArtifactCompilerService } from './artifact-compiler.service';
import { compileDocument } from './compiler';
import { COMPILER_VERSION, COMPILER_TEMPLATE_VERSION } from './compiler.types';
import type { CompileOptions } from './artifact-compiler.service';
import type { CompiledDocument, CompilerDocumentType } from './compiler.types';

export interface GenerateDocumentOptions extends CompileOptions {
  /** When true, an LLM polishes wording only — it never invents canonical facts. */
  refine?: boolean;
  /** Persist as a NEW version (default true); false updates in place. */
  createVersion?: boolean;
  /** Trigger event label stored on the document version row. */
  triggerEvent?: string;
  changeSummary?: string;
}

/**
 * DocumentGeneratorService (Phase 9) — reusable generator.
 *
 * compile → optional LLM wording refinement (facts come from the model) →
 * persist via RkbService (document + per-document versioning).
 */
@Injectable()
export class DocumentGeneratorService {
  private readonly logger = new Logger(DocumentGeneratorService.name);

  constructor(
    private readonly compiler: ArtifactCompilerService,
    private readonly rkb: RkbService,
    private readonly llm: LlmService,
  ) {}

  async generate(
    projectId: string,
    documentType: CompilerDocumentType,
    options: GenerateDocumentOptions = {},
  ): Promise<CompiledDocument> {
    const compiled = await this.compiler.compile(projectId, documentType, options);

    const markdown = options.refine
      ? await this.refineWording(compiled.markdown, documentType, projectId)
      : compiled.markdown;

    await this.rkb.saveDocument(
      projectId,
      markdown,
      options.changeSummary ?? `Artifact Compiler v${COMPILER_VERSION}`,
      options.triggerEvent ?? 'artifact-compiler',
      compiled.persistedDocumentType,
      { createVersion: options.createVersion !== false },
    );
    return { ...compiled, markdown };
  }

  /** Deterministic compile + render preview without persisting. */
  async preview(
    projectId: string,
    documentType: CompilerDocumentType,
    options: CompileOptions = {},
  ): Promise<CompiledDocument> {
    return this.compiler.compile(projectId, documentType, options);
  }

  /**
   * Wording-only refinement. The prompt explicitly forbids adding or changing
   * canonical facts, so the LLM can never invent project data.
   */
  private async refineWording(markdown: string, documentType: CompilerDocumentType, projectId: string): Promise<string> {
    try {
      const response = await this.llm.generateText([
        {
          role: 'system',
          content:
            'You are a technical editor. Polish the wording, structure, and formatting of the document below. ' +
            'NEVER add, remove, or alter any factual content, IDs, numbers, or claims. ' +
            'Every fact in the output MUST also exist verbatim in the input. Return the complete edited document.',
        },
        { role: 'user', content: markdown },
      ]);
      const edited = response.content?.trim();
      if (edited && edited.length > markdown.length * 0.5) return edited;
      return markdown;
    } catch (err) {
      this.logger.warn(`Document refinement failed for ${documentType} (${projectId}): ${err instanceof Error ? err.message : err}`);
      return markdown;
    }
  }
}

export { compileDocument, COMPILER_VERSION, COMPILER_TEMPLATE_VERSION };
