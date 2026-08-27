import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PromptsService } from './prompts.service';

@Controller('prompts')
export class PromptsController {
  constructor(private readonly prompts: PromptsService) {}

  @Get()
  list() {
    return this.prompts.list();
  }

  @Get(':key')
  get(@Param('key') key: string) {
    return this.prompts.get(key);
  }

  @Post('preview')
  preview(@Body() body: { key?: string; vars?: Record<string, unknown> }) {
    if (!body.key) throw new BadRequestException('key is required');
    return this.prompts.preview(body.key, body.vars ?? {});
  }

  @Post('snapshot')
  snapshot() {
    return this.prompts.snapshotTemplates();
  }
}
