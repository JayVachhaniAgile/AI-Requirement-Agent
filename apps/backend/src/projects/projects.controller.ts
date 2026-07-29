import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { AnswerQuestionDto } from './dto/answer-question.dto';

/** Maximum upload size per file (10 MB). */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Minimal upload file interface — matches Express.Multer.File shape at runtime. */
interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

/** Text-like MIME types that can be safely decoded to UTF-8. */
const TEXT_MIME_TYPES = new Set([
  'text/plain',
  'text/html',
  'text/markdown',
  'text/csv',
  'text/xml',
  'application/json',
  'application/xml',
  'application/x-yaml',
  'application/javascript',
  'application/typescript',
  'application/x-www-form-urlencoded',
  'application/octet-stream', // common fallback — we'll still try
]);

@Controller('projects')
export class ProjectsController {
  private readonly logger = new Logger(ProjectsController.name);

  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  list() {
    return this.projectsService.list();
  }

  @Post('upload')
  @UseInterceptors(
    AnyFilesInterceptor({ limits: { fileSize: MAX_FILE_SIZE } }),
  )
  async uploadFiles(
    @Body() body: { name?: string; idea?: string },
    @UploadedFiles() files: UploadedFile[],
  ) {
    const name = body.name?.trim();
    if (!name) {
      throw new BadRequestException('Project name is required');
    }

    const parts: string[] = [];

    // Add manual idea text if provided
    if (body.idea?.trim()) {
      parts.push(body.idea.trim());
    }

    // Add uploaded file contents
    if (files && files.length > 0) {
      for (const file of files) {
        const isText =
          TEXT_MIME_TYPES.has(file.mimetype) ||
          /\.(txt|md|csv|json|xml|yaml|yml|js|ts|py|java|rb|go|rs|c|cpp|h|hpp|sql|sh|bat|ps1|cfg|ini|env|log|html|css|scss|less)$/i.test(
            file.originalname,
          );

        if (!isText) {
          this.logger.warn(
            `File "${file.originalname}" (${file.mimetype}) may not be readable as text. ` +
              'Content will be included as raw text which may appear garbled.',
          );
        }

        const content = file.buffer.toString('utf-8');
        parts.push(`--- ${file.originalname} ---\n${content}`);
      }
    }

    if (parts.length === 0) {
      throw new BadRequestException('Provide an idea or upload at least one file');
    }

    const idea = parts.join('\n\n');
    this.logger.log(
      `Creating project "${name}" from idea + ${files?.length ?? 0} file(s) (${idea.length} chars)`,
    );

    return this.projectsService.create({ name, idea });
  }

  @Post()
  create(@Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto);
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.getById(id);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.projectsService.delete(id);
  }

  @Post(':id/start')
  start(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.start(id);
  }

  @Post(':id/recompile')
  recompile(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.recompile(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.cancel(id);
  }

  @Get(':id/progress')
  getProgress(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.getProgress(id);
  }

  @Get(':id/knowledge')
  getKnowledge(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.getKnowledge(id);
  }

  @Get(':id/requirements')
  getRequirements(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.getRequirements(id);
  }

  @Get(':id/assumptions')
  getAssumptions(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.getAssumptions(id);
  }

  @Get(':id/questions')
  getQuestions(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.getQuestions(id);
  }

  @Post(':id/questions/:questionId/answer')
  answerQuestion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: AnswerQuestionDto,
  ) {
    return this.projectsService.answerQuestion(id, questionId, dto);
  }

  @Get(':id/executions')
  getExecutions(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.getExecutions(id);
  }

  @Get(':id/validation')
  getValidation(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.getValidation(id);
  }

  @Get(':id/document')
  getDocument(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.getDocument(id);
  }

  @Get(':id/stats')
  getStats(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.getStats(id);
  }

  @Get(':id/dashboard')
  getDashboard(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.getDashboard(id);
  }
}
