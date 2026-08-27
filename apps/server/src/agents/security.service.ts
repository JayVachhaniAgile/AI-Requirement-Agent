import { Injectable, Optional } from '@nestjs/common';
import { z } from 'zod';
import { LlmService } from '../llm/llm.service';
import { AgentRunnerService } from './agent-runner.service';
import { buildAgentMessages } from '../prompts/prompt-builder.service';
import { SkillExecutorService } from '../foundation/skills/skill-executor.service';
import { getAgentStructuredSchema } from '../llm/agent-json-schemas';
import {
  AgentItemArray,
  ensureItemIds,
  ensureSummary,
  safeJsonParse,
} from './agent.utils';
import type { AgentContext, AgentResult, NewKnowledgeItem } from './types';

const Schema = z.object({
  lowConfidenceFlags: z.array(z.object({ field: z.string(), reason: z.string() })).default([]),
  authnAuthz: AgentItemArray,
  owaspFindings: AgentItemArray,
  encryptionSecrets: AgentItemArray,
  apiSecurity: AgentItemArray,
  compliance: AgentItemArray,
  threatModel: AgentItemArray,
  securitySummary: z.string().default(''),
  riskRating: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
});

const SECURITY_REVIEW_SCHEMA = getAgentStructuredSchema('security-review');


@Injectable()
export class SecurityService {
  constructor(
    private readonly llm: LlmService,
    private readonly agentRunner: AgentRunnerService,
    @Optional() private readonly skillExecutor?: SkillExecutorService,
  ) {}

  async run(ctx: AgentContext): Promise<AgentResult> {

    const { output: data, tokens } = await this.agentRunner.run({
      agentKey: 'security-review',
      messages: buildAgentMessages('security-review', ctx),
      schema: SECURITY_REVIEW_SCHEMA,
      parse: (content) => Schema.parse(safeJsonParse(content)),
      upstreamItems: ctx.knowledgeItems,
      projectId: ctx.projectId,
    });
    await this.skillExecutor?.recordExecution({
      skillKey: 'security-review',
      projectId: ctx.projectId,
      model: tokens.model,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      durationMs: 0,
    }).catch(() => undefined);
    await this.skillExecutor?.postPersist({
      projectId: ctx.projectId,
      skillKey: 'security-review',
    }).catch(() => undefined);
    const securitySummary = ensureSummary(
      data.securitySummary,
      `Security review for ${ctx.projectName}`,
    );
    const authnAuthz = ensureItemIds(data.authnAuthz, 'SEC-AUTH');
    const owaspFindings = ensureItemIds(data.owaspFindings, 'OWASP');
    const encryptionSecrets = ensureItemIds(data.encryptionSecrets, 'SEC-ENC');
    const apiSecurity = ensureItemIds(data.apiSecurity, 'SEC-API');
    const compliance = ensureItemIds(data.compliance, 'SEC-COMP');
    const threatModel = ensureItemIds(data.threatModel, 'THREAT');

    const knowledgeItems: NewKnowledgeItem[] = [
      {
        type: 'SECURITY_REPORT',
        title: `Security Report (${data.riskRating})`,
        description: `${securitySummary}\n\nOverall Risk: ${data.riskRating}`,
        status: 'CONFIRMED',
      },
      ...authnAuthz.map((i) => ({
        externalId: i.externalId,
        type: 'SECURITY_AUTH',
        title: i.title,
        description: i.description,
        status: 'CONFIRMED',
      })),
      ...owaspFindings.map((i) => ({
        externalId: i.externalId,
        type: 'OWASP_FINDING',
        title: i.title,
        description: i.description,
        status: 'DRAFT',
      })),
      ...encryptionSecrets.map((i) => ({
        externalId: i.externalId,
        type: 'SECURITY_ENCRYPTION',
        title: i.title,
        description: i.description,
        status: 'CONFIRMED',
      })),
      ...apiSecurity.map((i) => ({
        externalId: i.externalId,
        type: 'API_SECURITY',
        title: i.title,
        description: i.description,
        status: 'CONFIRMED',
      })),
      ...compliance.map((i) => ({
        externalId: i.externalId,
        type: 'SECURITY_COMPLIANCE',
        title: i.title,
        description: i.description,
        status: 'CONFIRMED',
      })),
      ...threatModel.map((i) => ({
        externalId: i.externalId,
        type: 'THREAT_MODEL',
        title: i.title,
        description: i.description,
        status: 'CONFIRMED',
      })),
    ];

    return {
      success: true,
      agentKey: 'security',
      knowledgeItems,
      questions: [],
      warnings:
        data.riskRating === 'CRITICAL' || data.riskRating === 'HIGH'
          ? [`Security risk rated ${data.riskRating}`]
          : [],
      _tokens: tokens,
    };
  }
}
