import { Controller, Get, Param, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MigrationComparisonService } from './migration.service';
import {
  MIGRATABLE_AGENTS,
  MIGRATION_BATCHES,
  batchForAgent,
  resolveMigrationMode,
  resolveThresholds,
  type MigrationMode,
} from './migration.config';

@Controller('foundation/migration')
export class MigrationController {
  constructor(
    private readonly comparisons: MigrationComparisonService,
    private readonly config: ConfigService,
  ) {}

  @Get('status')
  status() {
    const env = this.env();
    const thresholds = resolveThresholds(env);
    const agents = MIGRATABLE_AGENTS.map((agentKey) => ({
      agentKey,
      batch: batchForAgent(agentKey),
      mode: resolveMigrationMode(agentKey, env),
      enabled: (resolveMigrationMode(agentKey, env) as MigrationMode) !== 'legacy',
    }));
    return { agents, thresholds, batches: MIGRATION_BATCHES };
  }

  @Get('comparisons')
  list(
    @Query('projectId') projectId?: string,
    @Query('agentKey') agentKey?: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? Math.max(1, Math.min(500, Number(limit))) : 100;
    return this.comparisons.list({ projectId, agentKey, limit: parsed });
  }

  @Get('comparisons/:projectId/:agentKey')
  byProjectAndAgent(@Param('projectId') projectId: string, @Param('agentKey') agentKey: string) {
    return this.comparisons.list({ projectId, agentKey });
  }

  private env(): Record<string, string | undefined> {
    const out: Record<string, string | undefined> = {};
    for (const key of Object.keys(process.env)) {
      out[key] = process.env[key];
    }
    return out;
  }
}
