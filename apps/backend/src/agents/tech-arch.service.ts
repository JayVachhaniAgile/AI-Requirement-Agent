import { Injectable } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import type { AgentContext, AgentResult } from './types';

@Injectable()
export class TechArchService {
  constructor(private readonly llm: LlmService) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    const items = ctx.knowledgeItems
      .filter((i) => [
        'SYSTEM_ARCHITECTURE', 'DATA_ARCHITECTURE', 'AI_ARCHITECTURE',
        'SOLUTION_ARCHITECTURE', 'TECH_STACK', 'MODULE',
        'FUNCTIONAL_REQUIREMENT', 'SECURITY_REQUIREMENT', 'PERFORMANCE_REQUIREMENT',
        'API_CONTRACT', 'DATA_ENTITY',
      ].includes(i.type))
      .map((i) => `[${i.type}] ${i.title}: ${i.description ?? ''}`)
      .join('\n');

    const prompt = `Project: ${ctx.projectName}\n\nOriginal Idea:\n${ctx.idea}\n\nTechnical Knowledge Items:\n${items}\n\nGenerate a Technical Architecture Document (High-Level Design) covering:\n- System Overview & Architecture Diagram (ASCII/markdown)\n- Technology Stack & Justification (languages, frameworks, databases, cloud services)\n- Component Architecture (services, modules, layers)\n- Data Flow & Communication Patterns (sync/async, events, APIs)\n- Integration Architecture (external systems, third-party services)\n- Security Architecture (auth, encryption, compliance)\n- Deployment Architecture (infrastructure, scaling, CI/CD)\n- Monitoring & Observability\n\nWrite in professional architectural style. Use markdown diagrams (ASCII/Mermaid where helpful).`;

    const r = await this.llm.generateText([
      { role: 'system', content: 'You are a Senior Solution Architect. Produce a comprehensive High-Level Design document covering system architecture, tech stack, data flow, security, and deployment. Use professional technical writing with clear diagrams in ASCII/Mermaid markdown.' },
      { role: 'user', content: prompt },
    ]);

    return {
      success: true,
      agentKey: 'tech-arch',
      knowledgeItems: [{
        type: 'TECH_ARCH_DOCUMENT',
        title: `${ctx.projectName} — Technical Architecture Document`,
        description: `High-Level Design document. Contains ${r.content.length} characters.`,
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
