import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SkillRegistryService } from './skill-registry.service';
import { SkillExecutorService } from './skill-executor.service';
import type { SkillInput } from './skill.types';

@Controller('foundation/skills')
export class SkillsController {
  constructor(
    private readonly registry: SkillRegistryService,
    private readonly executor: SkillExecutorService,
  ) {}

  @Get()
  list() {
    return this.registry.list();
  }

  @Post('seed')
  seed() {
    return this.registry.seedAll();
  }

  @Get('definitions')
  definitions() {
    return { definitions: listAllDefinitions() };
  }

  @Get(':key')
  get(@Param('key') key: string) {
    return this.registry.get(key);
  }

  @Get(':key/version')
  version(@Param('key') key: string) {
    return this.registry.version(key);
  }

  @Post(':key/enable')
  enable(@Param('key') key: string) {
    return this.registry.enable(key);
  }

  @Post(':key/disable')
  disable(@Param('key') key: string) {
    return this.registry.disable(key);
  }

  @Post(':key/execute')
  execute(
    @Param('key') key: string,
    @Body() body: SkillInput & { dryRun?: boolean },
  ) {
    const { dryRun, ...input } = body;
    return this.executor.execute(key, input, { dryRun });
  }
}

import { SKILL_DEFINITIONS } from './skill.definitions';
function listAllDefinitions() {
  return SKILL_DEFINITIONS.map(({ outputSchema: _outputSchema, inputSchema: _inputSchema, ...def }) => def);
}
