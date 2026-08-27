import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { AgentRunnerService } from '../agents/agent-runner.service';
import { buildAgentMessages } from '../prompts/prompt-builder.service';
import { SkillExecutorService } from '../foundation/skills/skill-executor.service';
import { getAgentStructuredSchema } from '../llm/agent-json-schemas';
import { compactKnowledgeSummary, safeJsonParse } from '../agents/agent.utils';
import { RkbService } from '../rkb/rkb.service';
import { WorkflowEventsService } from '../realtime/workflow-events.service';
import {
  GapAnalysisRun,
  GapAnalysisActiveRun,
  GapAnalysisProposal,
  Project,
} from '../database/entities';
import { GAP_ANALYSIS_SYSTEM, GAP_PATCH_SYSTEM } from './gap-analysis.prompts';
import type { LLMMessage } from '../llm/llm.service';

const GapFindingSchema = z.object({
  document: z.string(),
  action: z.enum(['KEEP', 'UPDATE', 'APPEND', 'DEPRECATE']),
  section: z.string().default(''),
  finding: z.string(),
  explanation: z.string().default(''),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  confidence: z.number().min(0).max(100).optional(),
  suggestion: z.string().default(''),
});

const GapAnalysisSchema = z.object({
  coveragePct: z.number(),
  qualityScore: z.number(),
  totalGaps: z.number(),
  resolvedGaps: z.number(),
  remainingGaps: z.number(),
  stopAfterThisIteration: z.boolean().default(false),
  findings: z.array(GapFindingSchema).default([]),
  summary: z.string().default(''),
  lowConfidenceFlags: z.array(z.object({ field: z.string(), reason: z.string() })).default([]),
});

export type GapAction = 'KEEP' | 'UPDATE' | 'APPEND' | 'DEPRECATE';
export type GapSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface GapFinding {
  document: string;
  action: GapAction;
  /** Heading/section within the document that the gap affects ('' if unknown). */
  section: string;
  finding: string;
  /** Plain-language explanation a non-technical stakeholder can understand. */
  explanation: string;
  severity: GapSeverity;
  /** Optional confidence score (0-100) from the analysis. */
  confidence?: number;
  suggestion: string;
}

export interface GapAnalysisReport {
  coveragePct: number;
  qualityScore: number;
  totalGaps: number;
  resolvedGaps: number;
  remainingGaps: number;
  stopAfterThisIteration: boolean;
  findings: GapFinding[];
  summary: string;
}

export function isActionableFinding(finding: { action: string }): boolean {
  return finding.action === 'UPDATE' || finding.action === 'APPEND';
}

export function mapFindingToDocumentType(label: string): string | null {
  // Accept both human-readable labels ("Database Design Document") and stored
  // type names ("DB_DESIGN_DOCUMENT") by normalizing separators to spaces.
  const l = label.toLowerCase().replace(/[_-]+/g, ' ');
  if (/sow|scope of work/.test(l)) return 'SOW_DOCUMENT';
  if (/functional|frd/.test(l)) return 'FRD_DOCUMENT';
  if (/user stor|backlog/.test(l)) return 'USER_STORIES_DOCUMENT';
  if (/high.level|hld|technical architecture|architecture|tech arch/.test(l)) return 'TECH_ARCH_DOCUMENT';
  if (/database|db design|data model|entity/.test(l)) return 'DB_DESIGN_DOCUMENT';
  if (/api|openapi|endpoint|specification/.test(l)) return 'API_SPEC_DOCUMENT';
  if (/compiled|overall|final|master/.test(l)) return 'COMPILED_DOCUMENT';
  return null;
}

/**
 * Deterministic metrics for a single analysis pass: every finding counts
 * toward the total, actionable (UPDATE/APPEND) findings remain open, and
 * nothing is resolved during analysis (no changes are applied yet).
 */
export function computeRunMetrics(findings: GapFinding[]): {
  totalGaps: number;
  remainingGaps: number;
  resolvedGaps: number;
} {
  return {
    totalGaps: findings.length,
    remainingGaps: findings.filter(isActionableFinding).length,
    resolvedGaps: 0,
  };
}

export interface GapPatch {
  mode: 'REPLACE' | 'APPEND';
  section: string;
  newContent: string;
}

const GapPatchSchema = z.object({
  mode: z.enum(['REPLACE', 'APPEND']),
  section: z.string().default(''),
  newContent: z.string().min(1),
});

/** Normalize a heading for comparison: strip markers, trim, lowercase, collapse spaces. */
export function normalizeSectionTitle(title: string): string {
  return title
    .replace(/^#+\s*/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Find the [start, end) line range of the section whose heading matches
 * `sectionTitle`. `end` is the line of the next heading at the same or higher
 * level (or end of document). Returns null when no heading matches.
 */
export function findSectionRange(
  lines: string[],
  sectionTitle: string,
): { start: number; end: number } | null {
  const target = normalizeSectionTitle(sectionTitle);
  if (!target) return null;

  let start = -1;
  let startLevel = 0;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.*)$/);
    if (!match) continue;
    if (normalizeSectionTitle(match[2]) === target) {
      start = i;
      startLevel = match[1].length;
      break;
    }
  }
  if (start === -1) return null;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+/);
    if (match && match[1].length <= startLevel) {
      end = i;
      break;
    }
  }
  return { start, end };
}

/**
 * Merge a targeted patch into the existing document. REPLACE swaps the body of
 * the matching section (keeping its heading unless the patch supplies its own
 * heading); if the section cannot be found, the patch is appended as a new
 * section. APPEND always appends the patch content at the end.
 */
export function mergePatch(existing: string, patch: GapPatch): string {
  const content = patch.newContent.trim();
  if (!content) return existing;

  if (patch.mode === 'REPLACE') {
    const lines = existing.split('\n');
    const range = findSectionRange(lines, patch.section);
    if (range) {
      const before = lines.slice(0, range.start);
      const after = lines.slice(range.end);
      const headingLine = lines[range.start];
      const normalizedHeading = normalizeSectionTitle(headingLine);
      const normalizedContentStart = normalizeSectionTitle(content.split('\n')[0] ?? '');
      const contentHasHeading =
        normalizedContentStart === normalizedHeading ||
        content.trim().startsWith(headingLine.trim());
      const body = contentHasHeading ? content : `${headingLine}\n\n${content}`;
      return [...before, body, ...after].join('\n').replace(/\n{3,}/g, '\n\n');
    }
    // Section not found — append as a clearly-labeled new section.
    const heading = patch.section ? `## ${patch.section}` : '## Additional Details';
    return `${existing.trimEnd()}\n\n${heading}\n\n${content}\n`;
  }

  return `${existing.trimEnd()}\n\n${content}\n`;
}

@Injectable()
export class GapAnalysisService {
  private readonly logger = new Logger(GapAnalysisService.name);

  constructor(
    @InjectRepository(GapAnalysisRun) private readonly runRepo: Repository<GapAnalysisRun>,
    @InjectRepository(GapAnalysisActiveRun)
    private readonly activeRepo: Repository<GapAnalysisActiveRun>,
    @InjectRepository(GapAnalysisProposal)
    private readonly proposalRepo: Repository<GapAnalysisProposal>,
    @InjectRepository(Project) private readonly projectRepo: Repository<Project>,
    private readonly rkb: RkbService,
    private readonly agentRunner: AgentRunnerService,
    private readonly events: WorkflowEventsService,
    @Optional() private readonly skillExecutor?: SkillExecutorService,
  ) {}

  async startRun(projectId: string): Promise<{ started: boolean; alreadyRunning: boolean }> {
    const existing = await this.activeRepo.findOne({ where: { projectId } });

    if (existing?.status === 'AWAITING_REVIEW') {
      const pending = await this.proposalRepo.count({
        where: { projectId, status: 'PENDING' },
      });
      if (pending > 0) {
        // Proposals are waiting for the user — do not start a new run.
        return { started: false, alreadyRunning: true };
      }
      // No pending proposals: fall through and start a fresh run.
    }

    if (existing) {
      await this.activeRepo.remove(existing);
      await this.proposalRepo.delete({ projectId });
    }

    const active = this.activeRepo.create({
      id: randomUUID(),
      projectId,
      status: 'RUNNING',
      phase: 'starting',
      phaseDetail: null,
      error: null,
      startedAt: new Date(),
      completedAt: null,
      iteration: 0,
    });
    await this.activeRepo.save(active);

    setImmediate(() => {
      this.runGapAnalysis(projectId).catch((err: unknown) => {
        this.logger.error(`Gap analysis failed for project ${projectId}: ${err}`);
      });
    });
    return { started: true, alreadyRunning: false };
  }

  async getRunStatus(projectId: string) {
    const active = await this.activeRepo.findOne({ where: { projectId } });
    const proposals = await this.proposalRepo.find({
      where: { projectId, status: 'PENDING' },
      order: { createdAt: 'ASC' },
    });
    const history = await this.getHistory(projectId);
    const allProposals = await this.proposalRepo.find({ where: { projectId } });

    // Findings that have already been applied, keyed as `${iteration}:${index}`
    // so the UI can mark them and avoid double-applying.
    const appliedFindings: string[] = [];
    const applyingFindings: string[] = [];
    for (const run of history) {
      let findings: GapFinding[] = [];
      try {
        findings = JSON.parse(run.findingsJson ?? '[]') as GapFinding[];
      } catch {
        findings = [];
      }
      findings.forEach((finding, index) => {
        const matching = allProposals.filter(
          (p) =>
            p.iteration === run.iteration &&
            this.proposalMatchesFinding(p, finding),
        );
        if (matching.some((p) => p.status === 'APPLIED')) {
          appliedFindings.push(`${run.iteration}:${index}`);
        } else if (matching.some((p) => p.status === 'APPLYING')) {
          applyingFindings.push(`${run.iteration}:${index}`);
        }
      });
    }

    // Enrich proposals with reasons when they were created before reasons
    // were stored on the proposal row: derive them from the iteration's
    // persisted findings.
    const enriched = await Promise.all(
      proposals.map(async (proposal) => {
        if (proposal.reasonsJson) return proposal;
        const run = history.find((h) => h.iteration === proposal.iteration);
        if (!run?.findingsJson) return proposal;
        try {
          const findings = JSON.parse(run.findingsJson) as GapFinding[];
          const matching = findings.filter(
            (f) => mapFindingToDocumentType(f.document) === proposal.documentType,
          );
          if (matching.length === 0) return proposal;
          const first = matching[0];
          return {
            ...proposal,
            section: proposal.section ?? first.section ?? null,
            confidence: proposal.confidence ?? first.confidence ?? null,
            reasonsJson: JSON.stringify(
              matching.map((f) => ({
                finding: f.finding,
                explanation: f.explanation,
                severity: f.severity,
                section: f.section,
                confidence: f.confidence,
                suggestion: f.suggestion,
              })),
            ),
          };
        } catch {
          return proposal;
        }
      }),
    );

    return {
      activeRun: active ?? null,
      proposals: enriched,
      history,
      appliedFindings,
      applyingFindings,
    };
  }

  /** Cancel a running or review-pending gap-analysis run. */
  async stopRun(projectId: string): Promise<{ stopped: boolean }> {
    const active = await this.activeRepo.findOne({ where: { projectId } });
    if (
      !active ||
      active.status === 'COMPLETED' ||
      active.status === 'CANCELLED' ||
      active.status === 'FAILED'
    ) {
      return { stopped: false };
    }

    await this.activeRepo.update(
      { projectId },
      {
        status: 'CANCELLED',
        phase: 'cancelled',
        phaseDetail: 'Stopped by user',
        completedAt: new Date(),
      },
    );
    // Discard proposals that were never reviewed.
    await this.proposalRepo.update({ projectId, status: 'PENDING' }, { status: 'DISCARDED' });
    await this.projectRepo.update(projectId, {
      status: 'COMPLETED',
      currentStage: null,
    });
    this.events.emitGapAnalysisProgress(projectId, {
      status: 'CANCELLED',
      phase: 'cancelled',
      phaseDetail: 'Stopped by user',
      iteration: active.iteration ?? 0,
      error: null,
    });
    this.events.emitProjectStatus(projectId, {
      status: 'COMPLETED',
      currentStage: null,
    });
    return { stopped: true };
  }

  private async runGapAnalysis(projectId: string) {
    const active = await this.activeRepo.findOne({ where: { projectId } });
    if (!active) return;

    // Each execution is a single analysis pass; the iteration number keeps
    // growing across executions so history stays ordered and unique.
    const history = await this.getHistory(projectId);
    const iteration = history.length + 1;

    await this.setPhase(projectId, 'analyzing', 'Single-pass analysis of all artifacts');
    const priorContext = await this.buildPriorContext(projectId);
    const report = await this.analyze(projectId, priorContext);

    // Respect a user-initiated stop between engine steps.
    const currentRun = await this.activeRepo.findOne({ where: { projectId } });
    if (!currentRun || currentRun.status === 'CANCELLED') return;

    // Deterministic metrics for this single pass.
    const metrics = computeRunMetrics(report.findings);
    report.totalGaps = metrics.totalGaps;
    report.resolvedGaps = metrics.resolvedGaps;
    report.remainingGaps = metrics.remainingGaps;

    await this.activeRepo.update({ projectId }, { iteration });

    // No actionable gaps — nothing to review, finish immediately.
    if (report.findings.filter(isActionableFinding).length === 0) {
      await this.persist(projectId, iteration, report, []);
      await this.completeRun(projectId);
      return;
    }

    await this.setPhase(projectId, 'proposing', 'Preparing review proposals');
    const proposals = await this.propose(projectId, report, iteration);

    // Persist this run's findings to history BEFORE pausing, so the review
    // screen can reference the reasons.
    await this.persist(
      projectId,
      iteration,
      report,
      proposals.map((p) => p.documentType),
    );

    if (proposals.length === 0) {
      await this.completeRun(projectId);
      return;
    }

    await this.activeRepo.update(
      { projectId },
      {
        status: 'AWAITING_REVIEW',
        phase: 'awaiting_review',
        phaseDetail: `${proposals.length} proposals awaiting your review`,
        iteration,
      },
    );
    await this.projectRepo.update(projectId, {
      status: 'GAP_ANALYSIS_REVIEW',
      currentStage: 'GAP_ANALYSIS',
    });
    this.events.emitGapAnalysisProgress(projectId, {
      status: 'AWAITING_REVIEW',
      phase: 'awaiting_review',
      phaseDetail: `${proposals.length} proposals awaiting your review`,
      iteration,
      error: null,
    });
    this.events.emitProjectStatus(projectId, {
      status: 'GAP_ANALYSIS_REVIEW',
      currentStage: 'GAP_ANALYSIS',
    });
  }

  private async analyze(projectId: string, priorContext?: string): Promise<GapAnalysisReport> {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    const summaries = await this.rkb.getKnowledgeContext(projectId);
    const knowledgeDigest = compactKnowledgeSummary(summaries, {
      maxChars: 9000,
      maxDesc: 100,
      maxPerType: 6,
    });

    const documents = await this.rkb.getDocumentsByType(projectId);
    const documentsDigest = documents
      .map((d) => `## ${d.documentType}\n${(d.markdownContent ?? '').slice(0, 4000)}`)
      .join('\n\n');

    const userMsg =
      `Project: ${project.name}\n\nOriginal Idea:\n${(project.idea ?? '').slice(0, 2000)}\n\n` +
      `Knowledge Base:\n${knowledgeDigest}\n\nGenerated Documents:\n${documentsDigest || '(none yet)'}\n\n` +
      (priorContext ? `${priorContext}\n\n` : '') +
      `Analyze the artifacts above and produce your gap-analysis report JSON.`;

    const systemPrompt =
      buildAgentMessages('gap-analysis', {
        projectId,
        projectName: project.name,
        idea: project.idea ?? '',
        knowledgeItems: summaries,
      })[0]?.content ?? GAP_ANALYSIS_SYSTEM;

    const { output, tokens } = await this.agentRunner.run({
      agentKey: 'gap-analysis',
      projectId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMsg },
      ],
      schema: getAgentStructuredSchema('gap-analysis'),
      parse: (content) => GapAnalysisSchema.parse(safeJsonParse(content)),
      upstreamItems: summaries,
    });
    await this.skillExecutor?.recordExecution({
      skillKey: 'gap-analysis',
      projectId,
      model: tokens.model,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      durationMs: 0,
    }).catch(() => undefined);

    return output as unknown as GapAnalysisReport;
  }

  /** Build the iteration history for the analysis prompt (findings + statuses). */
  private async buildPriorContext(projectId: string): Promise<string> {
    const history = await this.getHistory(projectId);
    const proposals = await this.proposalRepo.find({
      where: { projectId },
      order: { createdAt: 'ASC' },
    });
    if (history.length === 0) return 'No prior analysis iterations.';

    const lines = ['Prior analysis findings and their statuses:'];
    for (const run of history) {
      let findings: GapFinding[] = [];
      try {
        findings = JSON.parse(run.findingsJson ?? '[]') as GapFinding[];
      } catch {
        findings = [];
      }
      for (const finding of findings) {
        const proposal = proposals.find(
          (p) =>
            p.iteration === run.iteration &&
            mapFindingToDocumentType(finding.document) === p.documentType,
        );
        const status = !proposal
          ? 'OPEN'
          : proposal.status === 'APPLIED'
            ? 'APPLIED'
            : proposal.status === 'REJECTED'
              ? 'REJECTED'
              : 'OPEN';
        lines.push(
          `- [iteration ${run.iteration}] [${status}] ${finding.document}: ${finding.finding}`,
        );
      }
    }
    return lines.join('\n');
  }

  private async propose(
    projectId: string,
    report: GapAnalysisReport,
    iteration: number,
  ): Promise<GapAnalysisProposal[]> {
    const proposals: GapAnalysisProposal[] = [];
    for (const finding of report.findings.filter(isActionableFinding)) {
      const docType = mapFindingToDocumentType(finding.document);
      if (!docType) continue;
      const existing = await this.rkb.getDocumentByType(projectId, docType);
      const proposal = this.proposalRepo.create({
        id: randomUUID(),
        projectId,
        iteration,
        documentType: docType,
        section: finding.section || null,
        confidence: finding.confidence ?? null,
        existingContent: existing?.markdownContent ?? null,
        proposedContent: null,
        reasonsJson: JSON.stringify([
          {
            finding: finding.finding,
            explanation: finding.explanation,
            severity: finding.severity,
            section: finding.section,
            confidence: finding.confidence,
            suggestion: finding.suggestion,
          },
        ]),
        status: 'PENDING',
      });
      await this.proposalRepo.save(proposal);
      proposals.push(proposal);
    }

    return proposals;
  }

  async applyProposal(projectId: string, proposalId: string): Promise<{ applied: boolean }> {
    const proposal = await this.proposalRepo.findOne({ where: { id: proposalId, projectId } });
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (proposal.status !== 'PENDING') throw new NotFoundException('Proposal is no longer pending');

    // Always patch against the latest content so earlier applied changes are
    // preserved and only this gap's section is modified.
    const current = await this.rkb.getDocumentByType(projectId, proposal.documentType);
    const existingContent = current?.markdownContent ?? proposal.existingContent ?? '';
    const patch = await this.generatePatch(
      projectId,
      proposal.documentType,
      this.parseReason(proposal),
      existingContent,
    );
    const merged = mergePatch(existingContent, patch);

    await this.rkb.saveDocument(
      projectId,
      merged,
      `Gap analysis — ${proposal.documentType} updated${proposal.section ? ` (${proposal.section})` : ''}`,
      'gap-analysis',
      proposal.documentType,
      { createVersion: false },
    );

    await this.proposalRepo.update(proposalId, {
      status: 'APPLIED',
      appliedAt: new Date(),
      proposedContent: merged,
    });
    await this.maybeCompleteRun(projectId);
    return { applied: true };
  }

  async rejectProposal(projectId: string, proposalId: string): Promise<{ rejected: boolean }> {
    const proposal = await this.proposalRepo.findOne({ where: { id: proposalId, projectId } });
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (proposal.status !== 'PENDING') throw new NotFoundException('Proposal is no longer pending');

    await this.proposalRepo.update(proposalId, { status: 'REJECTED' });
    await this.maybeCompleteRun(projectId);
    return { rejected: true };
  }

  async applyAllProposals(projectId: string): Promise<{ applied: number }> {
    const pending = await this.proposalRepo.find({ where: { projectId, status: 'PENDING' } });
    for (const proposal of pending) {
      await this.applyProposal(projectId, proposal.id);
    }
    return { applied: pending.length };
  }

  /**
   * Apply a gap directly from the findings list (e.g. after the run has
   * completed). `findingKey` is `${iteration}:${index}` into the run's
   * persisted findings. Applies the same targeted patch flow as a proposal,
   * but never creates a new document version.
   */
  async applyFinding(
    projectId: string,
    findingKey: string,
  ): Promise<{ applied: boolean; alreadyApplied?: boolean; alreadyApplying?: boolean }> {
    const match = /^(\d+):(\d+)$/.exec(findingKey);
    if (!match) throw new BadRequestException('Invalid finding reference');
    const iteration = Number(match[1]);
    const index = Number(match[2]);

    const run = await this.runRepo.findOne({ where: { projectId, iteration } });
    if (!run) throw new NotFoundException('Analysis iteration not found');

    let findings: GapFinding[] = [];
    try {
      findings = JSON.parse(run.findingsJson ?? '[]') as GapFinding[];
    } catch {
      findings = [];
    }
    const finding = findings[index];
    if (!finding) throw new NotFoundException('Finding not found');
    if (!isActionableFinding(finding)) {
      throw new BadRequestException('Only UPDATE/APPEND findings can be applied');
    }

    const relatedProposals = await this.proposalRepo.find({
      where: { projectId, iteration },
    });
    const matchingProposals = relatedProposals.filter((p) => this.proposalMatchesFinding(p, finding));
    if (matchingProposals.some((p) => p.status === 'APPLIED')) {
      return { applied: false, alreadyApplied: true };
    }
    if (matchingProposals.some((p) => p.status === 'PENDING')) {
      throw new BadRequestException(
        'This gap is already awaiting review — apply it from the proposals list above.',
      );
    }
    if (matchingProposals.some((p) => p.status === 'APPLYING')) {
      return { applied: false, alreadyApplying: true };
    }

    const docType = mapFindingToDocumentType(finding.document);
    if (!docType) throw new BadRequestException('Finding does not target a known document type');

    const current = await this.rkb.getDocumentByType(projectId, docType);
    const existingContent = current?.markdownContent ?? '';

    // Mark the finding as APPLYING before the (slow) LLM patch call so the
    // findings list shows an in-progress state even across tab switches and
    // reloads. The row is flipped to APPLIED on success or deleted on failure.
    const applyingProposal = await this.proposalRepo.save(
      this.proposalRepo.create({
        id: randomUUID(),
        projectId,
        iteration,
        documentType: docType,
        section: finding.section || null,
        confidence: finding.confidence ?? null,
        existingContent: existingContent || null,
        proposedContent: null,
        reasonsJson: JSON.stringify([
          {
            finding: finding.finding,
            explanation: finding.explanation,
            severity: finding.severity,
            section: finding.section,
            confidence: finding.confidence,
            suggestion: finding.suggestion,
          },
        ]),
        status: 'APPLYING',
        appliedAt: null,
      }),
    );

    try {
      const patch = await this.generatePatch(
        projectId,
        docType,
        {
          finding: finding.finding,
          explanation: finding.explanation,
          severity: finding.severity,
          suggestion: finding.suggestion,
          section: finding.section,
        },
        existingContent,
      );
      const merged = mergePatch(existingContent, patch);

      await this.rkb.saveDocument(
        projectId,
        merged,
        `Gap analysis — ${docType} updated${finding.section ? ` (${finding.section})` : ''}`,
        'gap-analysis',
        docType,
        { createVersion: false },
      );

      await this.proposalRepo.update(applyingProposal.id, {
        status: 'APPLIED',
        proposedContent: merged,
        appliedAt: new Date(),
      });
    } catch (err: unknown) {
      // Roll back the applying marker so the gap becomes actionable again.
      await this.proposalRepo.delete(applyingProposal.id);
      throw err;
    }

    return { applied: true };
  }

  /** Does this proposal correspond to the given finding? */
  private proposalMatchesFinding(
    proposal: GapAnalysisProposal,
    finding: GapFinding,
  ): boolean {
    const reason = this.parseReason(proposal);
    return (
      reason.finding === finding.finding &&
      mapFindingToDocumentType(finding.document) === proposal.documentType
    );
  }

  /** Parse the single finding stored on a proposal row. */
  private parseReason(proposal: GapAnalysisProposal): {
    finding?: string;
    explanation?: string;
    severity?: string;
    suggestion?: string;
    section?: string;
  } {
    let reason: {
      finding?: string;
      explanation?: string;
      severity?: string;
      suggestion?: string;
      section?: string;
    } = {};
    try {
      const reasons = JSON.parse(proposal.reasonsJson ?? '[]') as Array<Record<string, unknown>>;
      reason = (reasons[0] ?? {}) as {
        finding?: string;
        explanation?: string;
        severity?: string;
        suggestion?: string;
        section?: string;
      };
    } catch {
      reason = {};
    }
    return { ...reason, section: reason.section ?? proposal.section ?? undefined };
  }

  /**
   * Generate a TARGETED patch for a single gap (never the full document).
   * The patch is produced against the latest document content at apply time.
   */
  private async generatePatch(
    projectId: string,
    documentType: string,
    reason: { finding?: string; explanation?: string; severity?: string; suggestion?: string; section?: string },
    existingContent: string,
  ): Promise<GapPatch> {
    const messages: LLMMessage[] = [
      { role: 'system', content: GAP_PATCH_SYSTEM },
      {
        role: 'user',
        content:
          `Document type: ${documentType}\n\n` +
          `Existing document:\n\n${existingContent.slice(0, 24000)}\n\n` +
          `Gap to resolve:\n` +
          `- Affected section: ${reason.section || 'unspecified'}\n` +
          `- Finding: ${reason.finding ?? 'Unspecified gap'}\n` +
          (reason.suggestion ? `- Suggested change: ${reason.suggestion}\n` : '') +
          (reason.severity ? `- Priority: ${reason.severity}\n` : '') +
          (reason.explanation ? `- Explanation: ${reason.explanation}\n` : '') +
          `\nProduce the targeted patch JSON.`,
      },
    ];

    const { output } = await this.agentRunner.run({
      agentKey: 'gap-patch',
      projectId,
      messages,
      schema: getAgentStructuredSchema('gap-patch'),
      parse: (content) => GapPatchSchema.parse(safeJsonParse(content)),
    });

    return output as GapPatch;
  }

  /** Complete the run once every pending proposal has been resolved. */
  private async maybeCompleteRun(projectId: string): Promise<void> {
    const active = await this.activeRepo.findOne({ where: { projectId } });
    if (!active || active.status !== 'AWAITING_REVIEW') return;

    const pending = await this.proposalRepo.count({ where: { projectId, status: 'PENDING' } });
    if (pending > 0) return;

    await this.completeRun(projectId);
  }

  private async setPhase(
    projectId: string,
    phase: string,
    phaseDetail: string | null,
  ): Promise<void> {
    try {
      const active = await this.activeRepo.findOne({ where: { projectId } });
      if (!active) return;
      if (active.status === 'CANCELLED' || active.status === 'COMPLETED') return;
      await this.activeRepo.update({ projectId }, { phase, phaseDetail, status: 'RUNNING' });
      this.events.emitGapAnalysisProgress(projectId, {
        status: 'RUNNING',
        phase,
        phaseDetail,
        iteration: active.iteration ?? 0,
        error: null,
      });
    } catch (err: unknown) {
      this.logger.warn(`Failed to update gap-analysis phase: ${err}`);
    }
  }

  private async completeRun(projectId: string): Promise<void> {
    try {
      await this.activeRepo.update(
        { projectId },
        { status: 'COMPLETED', phase: 'completed', phaseDetail: null, completedAt: new Date() },
      );
      await this.projectRepo.update(projectId, {
        status: 'COMPLETED',
        currentStage: null,
      });
      this.events.emitGapAnalysisProgress(projectId, {
        status: 'COMPLETED',
        phase: 'completed',
        phaseDetail: null,
        iteration: 0,
        error: null,
      });
      this.events.emitProjectStatus(projectId, {
        status: 'COMPLETED',
        currentStage: null,
      });
    } catch (err: unknown) {
      this.logger.warn(`Failed to complete gap-analysis run: ${err}`);
    }
  }

  async getHistory(projectId: string): Promise<GapAnalysisRun[]> {
    return this.runRepo.find({
      where: { projectId },
      order: { iteration: 'ASC', createdAt: 'ASC' },
    });
  }

  private async persist(
    projectId: string,
    iteration: number,
    report: GapAnalysisReport,
    documentsUpdated: string[],
  ): Promise<GapAnalysisRun> {
    return this.runRepo.save(
      this.runRepo.create({
        id: randomUUID(),
        projectId,
        iteration,
        coveragePct: Math.round(report.coveragePct),
        qualityScore: Math.round(report.qualityScore),
        totalGaps: report.totalGaps,
        resolvedGaps: report.resolvedGaps,
        remainingGaps: report.remainingGaps,
        status: 'COMPLETED',
        findingsJson: JSON.stringify(report.findings),
        summary: report.summary,
        documentsUpdatedJson: JSON.stringify(documentsUpdated),
      }),
    );
  }
}
