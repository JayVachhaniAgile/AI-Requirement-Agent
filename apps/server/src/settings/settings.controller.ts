import { BadRequestException, Controller, Get, Put, Body } from '@nestjs/common';
import { SettingsService } from './settings.service';

const ALLOWED_PIPELINE_KEYS = new Set([
  'autoResumeOnFailure',
  'parallelAgentExecution',
  'generateDiagrams',
  'exportPdfOnCompletion',
  'minConfidenceScore',
  'maxCriticalIssues',
  'maxOpenQuestions',
  'minRequirementCoverage',
  'theme',
]);
const MAX_KEY_LEN = 64;
const MAX_VALUE_LEN = 256;

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('pipeline')
  getPipelineDefaults() {
    return this.settings.getPipelineDefaults();
  }

  @Put('pipeline')
  setPipelineDefaults(@Body() body: Record<string, string>) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Body must be a JSON object');
    }
    for (const [key, value] of Object.entries(body)) {
      if (!ALLOWED_PIPELINE_KEYS.has(key)) {
        throw new BadRequestException(`Unknown pipeline setting: ${key}`);
      }
      if (typeof key !== 'string' || key.length > MAX_KEY_LEN) {
        throw new BadRequestException(`Invalid key length`);
      }
      if (typeof value !== 'string' || value.length > MAX_VALUE_LEN) {
        throw new BadRequestException(`Invalid value for ${key}`);
      }
    }
    return this.settings.setPipelineDefaults(body);
  }
}
