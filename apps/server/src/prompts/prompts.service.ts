import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  PromptTemplate,
  PromptVersion,
  PromptTestRun,
} from '../database/entities';
import {
  buildAgentMessages,
  buildDocumentMessages,
  buildMessages,
  previewMessages,
} from './prompt-builder.service';
import { getTemplateVersion } from './prompt-versioner.service';
import {
  getTemplate,
  listTemplates,
  type AgentContextLike,
} from './template-registry';
import type { PromptTemplate as PromptTemplateDef } from './template.types';

@Injectable()
export class PromptsService {
  private readonly logger = new Logger(PromptsService.name);

  constructor(
    @InjectRepository(PromptTemplate) private readonly tplRepo: Repository<PromptTemplate>,
    @InjectRepository(PromptVersion) private readonly verRepo: Repository<PromptVersion>,
    @InjectRepository(PromptTestRun) private readonly testRepo: Repository<PromptTestRun>,
  ) {}

  /** List registered templates with their computed versions. */
  list() {
    return listTemplates().map((template) => ({
      key: template.key,
      kind: template.kind,
      description: template.description ?? '',
      version: getTemplateVersion(template),
    }));
  }

  get(key: string) {
    const template = getTemplate(key);
    return { template: serializeTemplate(template), version: getTemplateVersion(template) };
  }

  /** Render a template with sample variables — no LLM call. */
  preview(key: string, vars: Record<string, unknown> = {}) {
    return previewMessages(key, vars);
  }

  /** Build messages for an agent from its AgentContext. */
  buildAgentMessages(agentKey: string, ctx: AgentContextLike) {
    return buildAgentMessages(agentKey, ctx);
  }

  /** Build messages for a document generator. */
  buildDocumentMessages(docKey: string, vars: Record<string, unknown>) {
    return buildDocumentMessages(docKey, vars);
  }

  /**
   * Persist the current template set + computed versions (idempotent upsert).
   * Safe to call on demand; not run on every build.
   */
  async snapshotTemplates(createdBy = 'system'): Promise<{ templates: number; versions: number }> {
    let templates = 0;
    let versions = 0;
    for (const template of listTemplates()) {
      const version = getTemplateVersion(template);
      const existing = await this.tplRepo.findOne({ where: { promptKey: template.key } });
      const content = serializeTemplate(template);
      if (!existing || existing.contentHash !== version.contentHash) {
        await this.tplRepo.upsert(
          {
            id: existing?.id ?? randomUUID(),
            promptKey: template.key,
            kind: template.kind,
            content,
            contentHash: version.contentHash,
            variablesJson: template.variables ? JSON.stringify(template.variables) : null,
            metadata: null,
          },
          ['promptKey'],
        );
        templates += 1;
      }
      // Record a version row only when the hash changed.
      const lastVersion = await this.verRepo.findOne({
        where: { promptKey: template.key },
        order: { createdAt: 'DESC' },
      });
      if (!lastVersion || lastVersion.contentHash !== version.contentHash) {
        await this.verRepo.save(
          this.verRepo.create({
            id: randomUUID(),
            promptKey: template.key,
            version: version.promptVersion,
            contentHash: version.contentHash,
            schemaVersion: version.schemaVersion,
            diff: lastVersion ? `Changed from ${lastVersion.version} (${lastVersion.contentHash})` : null,
            createdBy,
          }),
        );
        versions += 1;
      }
    }
    this.logger.log(`Prompt snapshot: ${templates} template(s), ${versions} new version(s)`);
    return { templates, versions };
  }

  /** Record a prompt test run result. */
  async recordTestRun(
    promptKey: string,
    version: string,
    result: 'pass' | 'fail' | 'snapshot',
    sampleKey: string | null,
    assertionsJson: string | null,
  ): Promise<void> {
    await this.testRepo.save(
      this.testRepo.create({
        id: randomUUID(),
        promptKey,
        version,
        result,
        sampleKey,
        assertionsJson,
      }),
    );
  }

  /** Render a template for testing (pure, no persistence). */
  renderForTest(key: string, vars: Record<string, unknown> = {}) {
    const template = getTemplate(key);
    return { template: serializeTemplate(template), messages: buildMessages(template, vars) };
  }
}

function serializeTemplate(template: PromptTemplateDef): string {
  return JSON.stringify(
    {
      key: template.key,
      kind: template.kind,
      description: template.description ?? '',
      system: typeof template.system === 'function' ? template.system.toString() : template.system,
      user: typeof template.user === 'function' ? template.user.toString() : template.user,
      fewShot: template.fewShot ?? [],
      variables: template.variables ?? {},
      version: template.version ?? {},
    },
    null,
    2,
  );
}
