import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { LlmService } from '../llm/llm.service';
import { AgentItemArray, buildUserPrompt, ensureItemIds, ensureSummary, formatKnowledge, safeJsonParse } from './agent.utils';
import type { AgentContext, AgentResult, NewKnowledgeItem } from './types';

const Schema = z.object({
  authnAuthz: AgentItemArray,
  owaspFindings: AgentItemArray,
  encryptionSecrets: AgentItemArray,
  apiSecurity: AgentItemArray,
  compliance: AgentItemArray,
  threatModel: AgentItemArray,
  securitySummary: z.string().default(''),
  riskRating: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
});

const SYSTEM = `You are an expert Security Agent for a software engineering platform.

Produce JSON with exactly these fields:
- authnAuthz: [{externalId: "SEC-AUTH-001", title, description}] (3-6)
- owaspFindings: [{externalId: "OWASP-001", title, description}] (4-8)
- encryptionSecrets: [{externalId: "SEC-ENC-001", title, description}] (2-5)
- apiSecurity: [{externalId: "SEC-API-001", title, description}] (3-6)
- compliance: [{externalId: "SEC-COMP-001", title, description}] (2-5)
- threatModel: [{externalId: "THREAT-001", title, description}] (3-6)
- securitySummary: string
- riskRating: LOW|MEDIUM|HIGH|CRITICAL

Review architecture, APIs, data design, and AI surfaces. Prefer actionable mitigations.`;

@Injectable()
export class SecurityService {
  constructor(private readonly llm: LlmService) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    const context = formatKnowledge(ctx.knowledgeItems, [
      'SOLUTION_ARCHITECTURE', 'SYSTEM_COMPONENT', 'API_SPEC', 'DATABASE_DESIGN',
      'DB_TABLE', 'AI_ARCHITECTURE', 'AI_GUARDRAIL', 'COMPLIANCE_NOTE', 'FEATURE',
    ]);

    const r = await this.llm.generateStructured([
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: buildUserPrompt(ctx.projectName, ctx.idea, [
          { label: 'Architecture & Data Context', body: context },
        ], 'Produce security review as JSON.'),
      },
    ]);

    const data = Schema.parse(safeJsonParse(r.content));
    const securitySummary = ensureSummary(data.securitySummary, `Security review for ${ctx.projectName}`);
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
      ...authnAuthz.map((i) => ({ externalId: i.externalId, type: 'SECURITY_AUTH', title: i.title, description: i.description, status: 'CONFIRMED' })),
      ...owaspFindings.map((i) => ({ externalId: i.externalId, type: 'OWASP_FINDING', title: i.title, description: i.description, status: 'DRAFT' })),
      ...encryptionSecrets.map((i) => ({ externalId: i.externalId, type: 'SECURITY_ENCRYPTION', title: i.title, description: i.description, status: 'CONFIRMED' })),
      ...apiSecurity.map((i) => ({ externalId: i.externalId, type: 'API_SECURITY', title: i.title, description: i.description, status: 'CONFIRMED' })),
      ...compliance.map((i) => ({ externalId: i.externalId, type: 'SECURITY_COMPLIANCE', title: i.title, description: i.description, status: 'CONFIRMED' })),
      ...threatModel.map((i) => ({ externalId: i.externalId, type: 'THREAT_MODEL', title: i.title, description: i.description, status: 'CONFIRMED' })),
    ];

    return {
      success: true,
      agentKey: 'security',
      knowledgeItems,
      questions: [],
      warnings: data.riskRating === 'CRITICAL' || data.riskRating === 'HIGH'
        ? [`Security risk rated ${data.riskRating}`]
        : [],
      _tokens: { inputTokens: r.inputTokens, outputTokens: r.outputTokens, model: r.model },
    };
  }
}
