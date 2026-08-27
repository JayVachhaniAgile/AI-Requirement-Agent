import { Injectable } from '@nestjs/common';

const DOMAINS = [
  {
    id: 'healthcare',
    label: 'Healthcare',
    keywords: [
      'health',
      'medical',
      'patient',
      'clinical',
      'hospital',
      'pharma',
      'hipaa',
      'healthcare',
    ],
  },
  {
    id: 'finance',
    label: 'Finance / FinTech',
    keywords: [
      'finance',
      'banking',
      'payment',
      'investment',
      'trading',
      'compliance',
      'audit',
      'financial',
    ],
  },
  {
    id: 'ecommerce',
    label: 'E-commerce',
    keywords: [
      'ecommerce',
      'e-commerce',
      'shop',
      'store',
      'retail',
      'marketplace',
      'cart',
      'checkout',
    ],
  },
  {
    id: 'education',
    label: 'Education / EdTech',
    keywords: [
      'education',
      'learning',
      'student',
      'school',
      'university',
      'course',
      'edtech',
      'classroom',
    ],
  },
  {
    id: 'general',
    label: 'General',
    keywords: [],
  },
];

@Injectable()
export class DomainService {
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
}
