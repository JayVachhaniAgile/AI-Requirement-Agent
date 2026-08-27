import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkillExecutorService } from '../skills/skill-executor.service';
import { MigrationComparisonService } from './migration.service';
import {
  batchForAgent,
  isMigratableAgent,
  resolveMigrationMode,
  resolveThresholds,
  type MigrationMode,
  type MigrationThresholds,
} from './migration.config';
import {
  computeComparison,
  evaluateMigrationRule,
  summarizeLegacyOutput,
} from './comparison';
import type { AgentOutputSummary, ComparisonMetrics, MigrationVerdict } from './migration.types';
import type { AgentContext, AgentResult, NewKnowledgeItem, NewQuestion, NewValidationIssue } from '../../agents/types';
import type { SkillOutput } from '../skills/skill.types';

export interface AdapterRunOptions {
  /** Explicit mode override (otherwise resolved from env config). */
  mode?: MigrationMode;
  /** Explicit thresholds (otherwise resolved from env config). */
  thresholds?: MigrationThresholds;
}

/**
 * LegacyAgentAdapter (Phase 6).
 *
 * Lets a legacy agent run through the new Specialized AI Skill architecture
 * without changing its public `run(ctx): Promise<AgentResult>` contract.
 *
 *   legacy agent input → Skill input (via SkillExecutorService.executeShadow)
 *   Skill output → legacy-compatible AgentResult (in `new` mode)
 *
 * Modes (feature-flag driven, never hardcoded):
 *   legacy  — run the legacy agent only (production default)
 *   shadow  — legacy output is authoritative; the skill runs with zero state
 *             change; a comparison record is persisted
 *   new     — skill output is used ONLY when the migration rule passes;
 *             otherwise the system falls back to the legacy implementation
 */
@Injectable()
export class LegacyAgentAdapterService {
  constructor(
    private readonly skillExecutor: SkillExecutorService,
    private readonly comparisons: MigrationComparisonService,
    private readonly config: ConfigService,
  ) {}

  async run(
    agentKey: string,
    ctx: AgentContext,
    legacyRun: () => Promise<AgentResult>,
    options: AdapterRunOptions = {},
  ): Promise<AgentResult> {
    const env = this.env();
    const mode = options.mode ?? resolveMigrationMode(agentKey, env);
    const thresholds = options.thresholds ?? resolveThresholds(env);

    if (mode === 'legacy' || !isMigratableAgent(agentKey)) {
      return legacyRun();
    }

    const startedAt = Date.now();
    let legacy: AgentResult;
    try {
      legacy = await legacyRun();
    } catch (err) {
      // Legacy failed — never shadow-fail harder: rethrow so the pipeline's
      // existing error handling applies unchanged.
      throw err;
    }

    let skill: Awaited<ReturnType<SkillExecutorService['executeShadow']>>;
    try {
      skill = await this.skillExecutor.executeShadow(agentKey, {
        projectId: ctx.projectId,
        task: ctx.idea,
        artifactIds: ctx.knowledgeItems.map((k) => k.externalId ?? k.title),
      });
    } catch (skillErr) {
      // New skill failed: shadow mode keeps legacy output; new mode falls back.
      const msg = skillErr instanceof Error ? skillErr.message : String(skillErr);
      await this.storeFailure(agentKey, ctx.projectId, mode, startedAt, msg, legacy);
      return legacy;
    }

    const legacySummary = this.summarizeLegacy(agentKey, legacy, startedAt);
    const skillSummary: AgentOutputSummary = {
      artifactCount: skill.output.artifacts.length,
      confidence: skill.output.confidence,
      tokens: skill.tokens,
      latencyMs: skill.latencyMs,
      costUsd: skill.costUsd,
      qualityScore: skill.output.confidence,
      validationFailures: skill.validationFailures,
      itemKeys: skill.output.artifacts.map((a) => a.externalId),
      contentLength: 0,
    };

    const metrics: ComparisonMetrics = computeComparison(legacySummary, skillSummary);
    const verdict: MigrationVerdict = evaluateMigrationRule(legacySummary, skillSummary, metrics, thresholds);
    await this.comparisons.store({
      projectId: ctx.projectId,
      agentKey,
      batch: batchForAgent(agentKey),
      mode,
      legacy: legacySummary,
      skill: skillSummary,
      metrics,
      verdict,
    });

    if (mode === 'shadow') return legacy;

    // mode === 'new': use the skill output only when the migration rule passes.
    if (verdict.canMigrate) {
      return this.mapSkillOutput(agentKey, skill.output, ctx, skill.tokens);
    }
    return legacy; // fallback
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private env(): Record<string, string | undefined> {
    const out: Record<string, string | undefined> = {};
    for (const key of Object.keys(process.env)) {
      out[key] = process.env[key];
    }
    return out;
  }

  private summarizeLegacy(agentKey: string, result: AgentResult, startedAt: number): AgentOutputSummary {
    const itemKeys = [
      ...result.knowledgeItems.map((k) => k.externalId ?? k.title),
      ...(result.documentContent ? ['document'] : []),
    ];
    const confidences = result.knowledgeItems
      .map((k) => k.confidence)
      .filter((c): c is number => typeof c === 'number');
    const confidence = confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 70;
    return summarizeLegacyOutput({
      itemKeys,
      confidence,
      tokens: (result._tokens?.inputTokens ?? 0) + (result._tokens?.outputTokens ?? 0),
      latencyMs: Date.now() - startedAt,
      costUsd: 0,
      qualityScore: null,
      contentLength: result.documentContent?.length ?? 0,
    });
  }

  private async storeFailure(
    agentKey: string,
    projectId: string,
    mode: MigrationMode,
    startedAt: number,
    error: string,
    legacy: AgentResult,
  ): Promise<void> {
    const legacySummary = this.summarizeLegacy(agentKey, legacy, startedAt);
    const skillSummary = summarizeLegacyOutput({
      itemKeys: [],
      confidence: 0,
      tokens: 0,
      latencyMs: Date.now() - startedAt,
      costUsd: 0,
      qualityScore: null,
      validationFailures: 1,
    });
    await this.comparisons.store({
      projectId,
      agentKey,
      batch: batchForAgent(agentKey),
      mode,
      legacy: legacySummary,
      skill: skillSummary,
      metrics: computeComparison(legacySummary, skillSummary),
      verdict: {
        canMigrate: false,
        checks: {
          schemaPasses: false,
          qualityPasses: false,
          noCriticalRegression: false,
          requiredArtifacts: false,
          costLatencyAcceptable: false,
        },
        blockers: [`skill execution failed: ${error}`],
      },
    });
  }

  private mapSkillOutput(
    agentKey: string,
    output: SkillOutput,
    ctx: AgentContext,
    tokens: number,
  ): AgentResult {
    const knowledgeItems: NewKnowledgeItem[] = output.artifacts.map((a) => ({
      externalId: a.externalId,
      type: legacyTypeForKind(a.kind),
      title: a.title,
      description: a.summary ?? (a.body ? JSON.stringify(a.body).slice(0, 2000) : null),
      status: 'CONFIRMED',
      sourceCategory: 'ai_analysis',
      confidence: a.confidence ?? output.confidence,
      evidence: a.sources.map((s) => (s as { excerpt?: string }).excerpt).filter(Boolean).join('; ') || undefined,
    }));
    const questions: NewQuestion[] = output.questions.map((q) => ({
      question: q.prompt,
      context: q.context,
      isBlocking: q.isBlocking,
    }));
    const validationIssues: NewValidationIssue[] = output.validationIssues.map((v) => ({
      severity: v.severity,
      category: v.category,
      problem: v.problem,
      impact: v.impact,
      recommendedCorrection: v.recommendedCorrection,
    }));

    return {
      success: true,
      agentKey,
      knowledgeItems,
      questions,
      validationIssues,
      warnings: [],
      _tokens: { inputTokens: tokens, outputTokens: 0, model: 'skill' },
    };
  }
}

/** Best-effort canonical kind → legacy knowledge type mapping. */
function legacyTypeForKind(kind: string): string {
  const map: Record<string, string> = {
    project: 'PROJECT',
    project_goal: 'BUSINESS_GOAL',
    actor: 'ACTOR',
    domain: 'DOMAIN',
    business_process: 'BUSINESS_PROCESS',
    requirement: 'FUNCTIONAL_REQUIREMENT',
    non_functional_requirement: 'NON_FUNCTIONAL_REQUIREMENT',
    business_rule: 'BUSINESS_RULE',
    assumption: 'ASSUMPTION',
    constraint: 'CONSTRAINT',
    risk: 'RISK',
    question: 'QUESTION',
    user_story: 'USER_STORY',
    acceptance_criterion: 'ACCEPTANCE_CRITERION',
    entity: 'DATA_ENTITY',
    relationship: 'DATA_RELATIONSHIP',
    screen: 'SCREEN',
    api: 'API_SPEC',
    security_requirement: 'SECURITY_REQUIREMENT',
    architecture_decision: 'ARCHITECTURE_DECISION',
    test_case: 'TEST_CASE',
    estimate: 'ESTIMATE',
    scope_item: 'SCOPE_ITEM',
  };
  return map[kind] ?? 'KNOWLEDGE_ITEM';
}
