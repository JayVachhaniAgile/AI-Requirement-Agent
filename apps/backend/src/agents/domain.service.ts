import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { LlmService } from '../llm/llm.service';
import { safeJsonParse } from './agent.utils';

export interface DomainInfo {
  domain: string;
  subDomain?: string;
  standards: string[];
  regulations: string[];
  bestPractices: string[];
  specializedAgents: string[];
}

const DOMAINS = [
  { id: 'healthcare', label: 'Healthcare', keywords: ['health', 'medical', 'patient', 'clinical', 'hospital', 'pharma', 'hipaa', 'healthcare'] },
  { id: 'finance', label: 'Finance / FinTech', keywords: ['finance', 'banking', 'payment', 'investment', 'trading', 'compliance', 'audit', 'financial'] },
  { id: 'ecommerce', label: 'E-commerce', keywords: ['ecommerce', 'e-commerce', 'shop', 'store', 'retail', 'inventory', 'cart', 'checkout', 'product'] },
  { id: 'education', label: 'Education / EdTech', keywords: ['education', 'learning', 'student', 'course', 'classroom', 'training', 'academic', 'school'] },
  { id: 'saas', label: 'SaaS / Platform', keywords: ['saas', 'platform', 'subscription', 'multi-tenant', 'cloud', 'api'] },
  { id: 'logistics', label: 'Logistics / Supply Chain', keywords: ['logistics', 'supply chain', 'shipping', 'delivery', 'fleet', 'warehouse', 'inventory'] },
  { id: 'social', label: 'Social / Communication', keywords: ['social', 'chat', 'messaging', 'communication', 'community', 'forum', 'feed'] },
  { id: 'iot', label: 'IoT / Embedded', keywords: ['iot', 'internet of things', 'sensor', 'device', 'embedded', 'hardware', 'firmware'] },
  { id: 'general', label: 'General Software', keywords: [] },
];

const DOMAIN_SPECIFIC_PROMPTS: Record<string, string> = {
  healthcare: `\n\nIndustry Context: This is a Healthcare project. Apply these standards:
- HIPAA compliance for data privacy
- HL7/FHIR for healthcare data interoperability
- FDA guidelines for medical software (if applicable)
- Patient safety and clinical decision support considerations
- Accessibility requirements (Section 508, WCAG)
- Audit logging for all patient data access
- Data encryption at rest and in transit`,
  
  finance: `\n\nIndustry Context: This is a Financial project. Apply these standards:
- PCI-DSS for payment data
- SOX compliance for financial reporting
- GDPR/financial data protection regulations
- KYC/AML requirements
- Audit trail for all financial transactions
- Real-time reconciliation requirements
- Fraud detection and prevention measures`,
  
  ecommerce: `\n\nIndustry Context: This is an E-commerce project. Apply these standards:
- PCI-DSS for payment processing
- Inventory management best practices
- Shopping cart and checkout optimization
- Order fulfillment and tracking
- Customer review and rating systems
- Recommendation engine patterns
- Multi-currency and localization support`,
  
  education: `\n\nIndustry Context: This is an Education project. Apply these standards:
- FERPA/student data privacy
- SCORM/xAPI for learning content standards
- Accessibility (WCAG AA/AAA)
- Grade tracking and academic integrity
- Learning management system patterns
- Plagiarism detection considerations`,
};

const DomainSchema = z.object({
  domain: z.string(),
  subDomain: z.string().nullish(),
  reasoning: z.string(),
  standards: z.array(z.string()).optional(),
  regulations: z.array(z.string()).optional(),
  bestPractices: z.array(z.string()).optional(),
});

@Injectable()
export class DomainService {
  private readonly logger = new Logger(DomainService.name);

  constructor(private readonly llm: LlmService) {}

  detectByKeywords(idea: string): string {
    const lower = idea.toLowerCase();
    for (const domain of DOMAINS) {
      if (domain.id === 'general') continue;
      for (const kw of domain.keywords) {
        if (lower.includes(kw)) return domain.id;
      }
    }
    return 'general';
  }

  async detectDomain(idea: string, projectName: string): Promise<DomainInfo> {
    // First try keyword matching
    const keywordDomain = this.detectByKeywords(idea);

    // Then verify and enrich with LLM
    try {
      const prompt = `Project: ${projectName}\nIdea: ${idea}\n\nDetect the primary domain of this software project. Respond with JSON: { "domain": string, "subDomain"?: string, "reasoning": string, "standards"?: string[], "regulations"?: string[], "bestPractices"?: string[] }`;
      const r = await this.llm.generateStructured([
        { role: 'system', content: 'You are a JSON domain classifier for software projects. Detect the industry domain from a project description and respond in JSON format.' },
        { role: 'user', content: prompt },
      ]);
      const data = DomainSchema.parse(safeJsonParse(r.content));
      
      const domain = data.domain.toLowerCase();
      const domainPrompt = DOMAIN_SPECIFIC_PROMPTS[domain] || '';
      const standards = data.standards ?? [];
      const regulations = data.regulations ?? [];
      const bestPractices = data.bestPractices ?? [];

      return {
        domain,
        subDomain: data.subDomain,
        standards,
        regulations,
        bestPractices,
        specializedAgents: this.getSpecializedAgents(domain),
      };
    } catch {
      // Fallback to keyword detection
      return {
        domain: keywordDomain,
        specializedAgents: this.getSpecializedAgents(keywordDomain),
        standards: [],
        regulations: [],
        bestPractices: [],
      };
    }
  }

  getDomainPrompt(domain: string): string {
    return DOMAIN_SPECIFIC_PROMPTS[domain] || '';
  }

  getSpecializedAgents(domain: string): string[] {
    const baseAgents = ['discovery', 'research', 'business-analysis', 'requirements-engineering'];
    switch (domain) {
      case 'healthcare':
        return [...baseAgents, 'compliance-agent', 'data-architecture', 'security-review'];
      case 'finance':
        return [...baseAgents, 'security-review', 'data-architecture', 'qa-planning'];
      case 'ecommerce':
        return [...baseAgents, 'ux-design', 'data-architecture', 'estimation'];
      case 'education':
        return [...baseAgents, 'ux-design', 'security-review', 'qa-planning'];
      default:
        return baseAgents;
    }
  }
}
