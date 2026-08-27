import type { GoldenDatasetEntry } from './eval-metrics';

/**
 * Fixed regression-eval inputs (P2-1). Run the full pipeline against each
 * before and after prompt/pipeline-logic changes to confirm improvements.
 */
export const GOLDEN_DATASET: GoldenDatasetEntry[] = [
  {
    id: 'vague-one-liner',
    name: 'Habit Tracker (vague)',
    description: 'Vague one-liner — tests discovery robustness with minimal signal.',
    idea: 'an app that helps people track things',
  },
  {
    id: 'detailed-spec',
    name: 'Task Manager (detailed)',
    description: 'Detailed spec — tests that rich input is preserved through the chain.',
    idea: 'A task management app for small teams with: user authentication (email + Google SSO), projects with multiple boards, tasks with due dates, priority levels, recurring tasks, comments and mentions, file attachments, activity feed, email + push notifications for due reminders, role-based permissions (owner/admin/member/viewer), and a public REST API with webhooks.',
  },
  {
    id: 'simple-crud',
    name: 'Inventory Manager (CRUD)',
    description: 'Simple CRUD app — baseline for FR-scaling vs feature count.',
    idea: 'A simple inventory management system where users can add products with name, SKU, price and quantity, update stock levels, search products, and generate low-stock reports. Single admin role.',
  },
  {
    id: 'ai-heavy-product',
    name: 'AI Meeting Assistant',
    description: 'Complex AI-heavy product — exercises AI Architect and solution decisions.',
    idea: 'An AI meeting assistant that joins video calls, transcribes them in real time, summarizes decisions and action items, and syncs them to Jira and Notion. It should detect action item owners, flag risks, and answer questions about past meetings via a chat interface. Needs speaker diarization, retrieval over transcripts, and a permission model for sensitive meetings.',
  },
  {
    id: 'healthcare-domain',
    name: 'Telehealth Clinic Platform',
    description: 'Domain-specific (healthcare) — tests standards/regulations handling.',
    idea: 'A telehealth platform for clinics: patients book appointments with doctors, join video consultations, receive e-prescriptions, and pay online. Doctors manage availability, see patient records, and write visit notes. Must handle HIPAA-style privacy requirements, appointment reminders via SMS/email, and integration with pharmacy systems.',
  },
  {
    id: 'ecommerce-domain',
    name: 'B2B Marketplace',
    description: 'Ecommerce — tests catalog, orders, payments, and seller flows.',
    idea: 'A B2B marketplace where sellers list products with bulk pricing tiers, buyers search and filter by category and MOQ, place orders with approval workflows, and track shipments. Includes invoicing, escrow-style payments, seller analytics dashboard, and a rating system.',
  },
  {
    id: 'fintech-domain',
    name: 'Expense & Budgeting App',
    description: 'Fintech — tests security, compliance, and estimation realism.',
    idea: 'A personal finance app that connects to bank accounts via read-only APIs, categorizes transactions automatically, builds budgets, and alerts users about unusual spending. Users can set savings goals and share a household budget with a partner. Must handle 2FA, data encryption, bank integration outages, and regulatory considerations.',
  },
  {
    id: 'offline-mobile',
    name: 'Field Service App (offline)',
    description: 'Mobile-first with offline requirements — tests UX/architecture trade-offs.',
    idea: 'A mobile app for field technicians to receive work orders, view equipment history, capture photos and signatures, and close jobs. Works offline in basements and remote sites: jobs and notes sync when connectivity returns. Includes shift scheduling, parts inventory lookup, and a live map of open jobs for dispatchers.',
  },
];
