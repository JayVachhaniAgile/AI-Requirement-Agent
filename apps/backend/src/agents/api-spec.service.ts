import { Injectable } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import type { AgentContext, AgentResult } from './types';

@Injectable()
export class ApiSpecService {
  constructor(private readonly llm: LlmService) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    const items = ctx.knowledgeItems
      .filter((i) => [
        'FUNCTIONAL_REQUIREMENT', 'API_CONTRACT', 'SYSTEM_ARCHITECTURE',
        'FEATURE', 'MODULE', 'DATA_ENTITY', 'BUSINESS_REQUIREMENT',
        'SECURITY_REQUIREMENT', 'PERFORMANCE_REQUIREMENT',
      ].includes(i.type))
      .map((i) => `[${i.type}] ${i.title}: ${i.description ?? ''}`)
      .join('\n');

    const prompt = `Project: ${ctx.projectName}\n\nOriginal Idea:\n${ctx.idea}\n\nKnowledge Items:\n${items}\n\nGenerate a complete API Specification document (OpenAPI/Swagger style) covering:\n- API Overview & Base URL\n- Authentication & Authorization\n- Endpoints grouped by domain/resource\n  - Request/Response schemas (JSON)\n  - HTTP methods, paths, parameters\n  - Status codes & error responses\n  - Rate limiting headers\n- WebSocket events (if applicable)\n- API Versioning Strategy\n- Error Handling Convention\n- SDK/Client Generation Notes\n\nUse OpenAPI 3.0 format for endpoint definitions. Include example request/response payloads.`;

    const r = await this.llm.generateText([
      { role: 'system', content: 'You are a Senior API Architect. Produce a comprehensive API Specification in OpenAPI 3.0 style with clear endpoint definitions, request/response schemas, auth, and error handling. Use markdown with code blocks for JSON schemas.' },
      { role: 'user', content: prompt },
    ]);

    return {
      success: true,
      agentKey: 'api-spec',
      knowledgeItems: [{
        type: 'API_SPEC_DOCUMENT',
        title: `${ctx.projectName} — API Specification`,
        description: `Complete OpenAPI-style API Specification. Contains ${r.content.length} characters.`,
        status: 'CONFIRMED' as const,
        sourceCategory: 'ai_analysis' as const,
        confidence: 85,
      }],
      questions: [],
      documentContent: r.content,
      warnings: [],
    };
  }
}
