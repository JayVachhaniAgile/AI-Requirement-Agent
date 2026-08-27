import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { AgentSkill } from '../../database/entities';
import { SKILL_DEFINITIONS, getSkillDefinition } from './skill.definitions';
import type { SkillDefinition, SkillStatus } from './skill.types';

export interface RegisterSkillResult {
  skill: AgentSkill;
  /** True when the persisted definition was seeded from the static registry. */
  seeded: boolean;
}

/**
 * SkillRegistry (Phase 5).
 *
 * Persists the standardized `SkillDefinition`s into the existing
 * `agent_skills` table (extended with prompt/token/dependency columns).
 * Every registry operation resolves against the strongly typed definition
 * first and only then materializes the row, so the database can never hold
 * a contract-less skill.
 */
@Injectable()
export class SkillRegistryService {
  private readonly logger = new Logger(SkillRegistryService.name);

  constructor(
    @InjectRepository(AgentSkill)
    private readonly skillRepo: Repository<AgentSkill>,
  ) {}

  /** Register (or refresh) all standardized skill definitions. */
  async seedAll(): Promise<AgentSkill[]> {
    const out: AgentSkill[] = [];
    for (const def of SKILL_DEFINITIONS) {
      out.push(await this.register(def));
    }
    return out;
  }

  async register(def: SkillDefinition): Promise<AgentSkill> {
    const existing = await this.skillRepo.findOne({ where: { key: def.key } });
    const row = existing ?? this.skillRepo.create({ id: randomUUID(), key: def.key });
    row.name = def.name;
    row.description = def.description;
    row.version = def.version;
    row.status = def.status;
    row.modelTier = def.modelTier;
    row.promptKey = def.promptKey;
    row.maxTokens = def.maxTokens;
    row.tokenBudget = def.tokenBudget;
    row.inputSchema = JSON.stringify(def.inputSchema);
    row.outputSchema = JSON.stringify(def.outputSchema);
    row.producedArtifacts = def.producedArtifacts.join(',');
    row.requiredContext = def.requiredContext.join(',');
    row.qualityGates = def.qualityGates.join(',');
    row.dependencies = def.dependencies.map((d) => d.skillKey).join(',');
    row.supportsStructured = true;
    row.enabled = true;
    row.metadata = JSON.stringify({ validationRules: def.validationRules, tools: def.tool ?? null });
    return this.skillRepo.save(row);
  }

  async get(key: string): Promise<AgentSkill> {
    const row = await this.skillRepo.findOne({ where: { key } });
    if (!row) throw new NotFoundException(`Skill '${key}' not registered`);
    return row;
  }

  /** Resolve the static definition for a skill key (source of truth). */
  getDefinition(key: string): SkillDefinition {
    const def = getSkillDefinition(key);
    if (!def) throw new NotFoundException(`No skill definition for '${key}'`);
    return def;
  }

  /** Resolve a persisted skill row by key, or null when unregistered. */
  async resolve(key: string): Promise<AgentSkill | null> {
    return this.skillRepo.findOne({ where: { key } });
  }

  list(enabledOnly = false): Promise<AgentSkill[]> {
    return this.skillRepo.find({
      where: enabledOnly ? { enabled: true } : {},
      order: { key: 'ASC' },
    });
  }

  async setStatus(key: string, status: SkillStatus): Promise<AgentSkill> {
    const row = await this.get(key);
    row.status = status;
    return this.skillRepo.save(row);
  }

  async enable(key: string): Promise<AgentSkill> {
    const row = await this.get(key);
    row.enabled = true;
    return this.skillRepo.save(row);
  }

  async disable(key: string): Promise<AgentSkill> {
    const row = await this.get(key);
    row.enabled = false;
    return this.skillRepo.save(row);
  }

  async version(key: string): Promise<string> {
    const row = await this.get(key);
    return row.version;
  }
}
