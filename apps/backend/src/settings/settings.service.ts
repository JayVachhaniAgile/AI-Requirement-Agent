import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Settings } from '../database/entities';

const PIPELINE_DEFAULTS: Record<string, string> = {
  autoResumeOnFailure: 'true',
  parallelAgentExecution: 'false',
  generateDiagrams: 'true',
  exportPdfOnCompletion: 'false',
  minConfidenceScore: '70',
  maxCriticalIssues: '0',
  maxOpenQuestions: '5',
  minRequirementCoverage: '80',
  theme: 'light',
};

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Settings) private readonly settingsRepo: Repository<Settings>,
  ) {}

  async getPipelineDefaults(): Promise<Record<string, string>> {
    const rows = await this.settingsRepo.find();
    const result = { ...PIPELINE_DEFAULTS };
    for (const row of rows) {
      if (row.key in PIPELINE_DEFAULTS) {
        result[row.key] = row.value ?? PIPELINE_DEFAULTS[row.key];
      }
    }
    return result;
  }

  async setPipelineDefaults(values: Record<string, string>): Promise<Record<string, string>> {
    for (const [key, value] of Object.entries(values)) {
      if (key in PIPELINE_DEFAULTS) {
        await this.settingsRepo.upsert(
          { key, value },
          ['key'],
        );
      }
    }
    return this.getPipelineDefaults();
  }
}
