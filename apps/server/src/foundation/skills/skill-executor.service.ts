import { Injectable, Logger } from '@nestjs/common';
import { LlmService, type LLMMessage } from '../../llm/llm.service';
import { buildAgentMessages } from '../../prompts/prompt-builder.service';
import { ModelRouterService } from '../models/model-router.service';
import { ModelUsageService } from '../observability/model-usage.service';
import { estimateCost } from '../observability/model-pricing';
import { WorkflowExecutionService } from '../orchestration/workflow-execution.service';
import { ContextEngineService } from '../context/context-engine.service';
import { CanonicalModelService } from '../canonical/canonical-model.service';
import { SkillRegistryService } from './skill-registry.service';
import { QualityGateService } from '../validation/quality-gate.service';
import { ArtifactDependencyService } from '../artifacts/artifact-dependency.service';
import { getSkillDefinition } from './skill.definitions';
import { defaultContextRequest } from './skill.types';
import type { ContextPackage } from '../context/context.types';
import type { SkillDefinition, SkillExecutionRecord, SkillInput, SkillOutput } from './skill.types';

export interface ExecuteSkillOptions {
  /** When false, reuse an already-built context package from the input. */
  buildContext?: boolean;
  /** Skip the canonical persistence step (dry-run). */
  dryRun?: boolean;
}

export interface ExecuteSkillResult {
  execution: SkillExecutionRecord;
  output: SkillOutput;
  /** Canonical item ids persisted (empty on dry-run). */
  persistedArtifactIds: string[];
  promptVersion: string;
}

/**
 * SkillExecutor (Phase 5).
 *
 * Standardized execution path for a Specialized AI Skill:
 *
 *   SkillInput
 *     → Context Engine (ContextRequest scoped by the skill definition)
 *     → PromptBuilderService (versioned template — never inline)
 *     → LlmService (structured output via Model Router)
 *     → validation (schema → normalization → business → provenance)
 *     → CanonicalModelService.ingest (persist as trusted canonical items)
 *     → AgentSkillExecution + ModelUsage (tokens, cost, duration)
 *
 * The executor never persists arbitrary LLM output: every artifact is
 * validated by the canonical pipeline before it becomes trusted data.
 */
@Injectable()
export class SkillExecutorService {
  private readonly logger = new Logger(SkillExecutorService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly router: ModelRouterService,
    private readonly usage: ModelUsageService,
    private readonly workflow: WorkflowExecutionService,
    private readonly contextEngine: ContextEngineService,
    private readonly canonical: CanonicalModelService,
    private readonly registry: SkillRegistryService,
    private readonly qualityGates: QualityGateService,
    private readonly dependencyGraph: ArtifactDependencyService,
  ) {}

  async execute(
    skillKey: string,
    input: SkillInput,
    options: ExecuteSkillOptions = {},
  ): Promise<ExecuteSkillResult> {
    const def = this.registry.getDefinition(skillKey);
    const startedAt = Date.now();

    // 1. Skill execution row (AgentSkillExecution).
    const skillRow = await this.registry.resolve(skillKey);
    const executionRow = await this.workflow.startSkillExecution({
      projectId: input.projectId,
      skillKey,
      skillId: skillRow?.id ?? undefined,
      workflowExecutionId: input.workflowExecutionId,
    });

    try {
      // 2. Context: build (or reuse) a task-scoped package via the engine.
      const contextPackage: ContextPackage | undefined =
        input.contextPackage ??
        (options.buildContext === false
          ? undefined
          : await this.contextEngine.compile(defaultContextRequest(input, def)));

      // 3. Model route + prompt (PromptBuilder — never inline).
      const route = this.router.route({ skillKey, largeOutput: def.maxTokens > 4000 });
      const messages = this.buildMessages(def, input, contextPackage);

      // 4. LLM call (structured, forced tool when the provider supports it).
      const result = await this.llm.generateForcedStructured(
        messages,
        {
          toolName: def.tool?.name ?? `submit_${skillKey}_output`,
          schema: def.outputSchema,
        },
        { agentKey: skillKey },
      );

      // 5. Parse + validate + persist as canonical artifacts.
      const output = this.parseOutput(result.content, def);
      const persisted: string[] = [];
      if (!options.dryRun) {
        for (const artifact of output.artifacts) {
          const ingest = await this.canonical.ingest(input.projectId, {
            externalId: artifact.externalId,
            kind: artifact.kind,
            title: artifact.title,
            summary: artifact.summary,
            status: 'CONFIRMED',
            provenance: {
              epistemicClass: artifact.epistemicClass,
              sources: artifact.sources,
              producedBy: skillKey,
              schemaVersion: def.version,
            },
            body: artifact.body,
          });
          persisted.push(ingest.item.id);
        }
        for (const question of output.questions) {
          await this.canonical.ingest(input.projectId, {
            externalId: `Q-${Math.abs(question.prompt.length) % 100000}-${startedAt % 10000}`,
            kind: 'question',
            title: question.prompt.slice(0, 120),
            status: 'PROPOSED',
            provenance: {
              epistemicClass: 'ASSUMPTION',
              sources: [{ category: 'user_input' }],
              producedBy: skillKey,
              schemaVersion: def.version,
            },
            body: { prompt: question.prompt, isBlocking: question.isBlocking, context: question.context },
          });
        }
      }

      // 6. Token + cost tracking (ModelUsage) + complete the execution row.
      const usageRow = await this.usage.record({
        projectId: input.projectId,
        workflowExecutionId: input.workflowExecutionId,
        skillExecutionId: executionRow.id,
        skillKey,
        model: result.model,
        provider: route.provider,
        mode: route.mode,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      });

      const durationMs = Date.now() - startedAt;
      await this.workflow.completeSkillExecution(executionRow.id, {
        status: 'COMPLETED',
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        model: result.model,
        retryCount: 0,
        confidence: output.confidence,
      });

      return {
        execution: {
          skillKey,
          skillVersion: def.version,
          projectId: input.projectId,
          workflowExecutionId: input.workflowExecutionId,
          skillExecutionId: executionRow.id,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          totalTokens: result.inputTokens + result.outputTokens,
          costUsd: usageRow.estimatedCostUsd,
          durationMs,
          status: 'COMPLETED',
          retryCount: 0,
          qualityScore: output.confidence,
        },
        output,
        persistedArtifactIds: persisted,
        promptVersion: `v${def.version}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.workflow.completeSkillExecution(executionRow.id, {
        status: 'FAILED',
        error: message,
        retryCount: 0,
      });
      throw err;
    }
  }

  /**
   * Record a completed skill execution + model usage (tokens/cost).
   *
   * Used by the migrated legacy agents to keep the new observability layer
   * populated without changing their public `run()` contract.
   */
  async recordExecution(input: {
    skillKey: string;
    projectId: string;
    workflowExecutionId?: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    confidence?: number;
    durationMs?: number;
    metadata?: Record<string, unknown>;
  }): Promise<{ skillExecutionId: string; costUsd: number }> {
    const skillRow = await this.registry.resolve(input.skillKey);
    const executionRow = await this.workflow.startSkillExecution({
      projectId: input.projectId,
      skillKey: input.skillKey,
      skillId: skillRow?.id ?? undefined,
      workflowExecutionId: input.workflowExecutionId,
    });
    const usageRow = await this.usage.record({
      projectId: input.projectId,
      workflowExecutionId: input.workflowExecutionId,
      skillExecutionId: executionRow.id,
      skillKey: input.skillKey,
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      metadata: input.metadata,
    });
    await this.workflow.completeSkillExecution(executionRow.id, {
      status: 'COMPLETED',
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      model: input.model,
      retryCount: 0,
      confidence: input.confidence,
      metadata: { durationMs: input.durationMs },
    });
    return { skillExecutionId: executionRow.id, costUsd: usageRow.estimatedCostUsd };
  }

  /**
   * Post-persistence quality gates + dependency validation (Phase 5 migration).
   *
   * Runs the gates declared by the skill definition and validates the project
   * dependency graph. Both run against the persisted project state and never
   * throw — failures are reported so the caller can decide.
   */
  async postPersist(input: {
    projectId: string;
    workflowExecutionId?: string;
    skillKey: string;
    requiredArtifactTypes?: string[];
  }): Promise<{
    quality: { gateKeys: string[]; passed: string[]; failed: string[]; pass: boolean };
    dependencies: { ok: boolean; errors: string[]; warnings: string[] };
  }> {
    const def = getSkillDefinition(input.skillKey);
    const gateKeys = def?.qualityGates ?? [];
    const quality = await this.qualityGates.run({
      projectId: input.projectId,
      workflowExecutionId: input.workflowExecutionId,
      requiredArtifactTypes: input.requiredArtifactTypes,
    });
    const dependencies = await this.dependencyGraph.validateProjectGraph(input.projectId);
    return {
      quality: {
        gateKeys,
        passed: quality.passed,
        failed: quality.failed,
        pass: quality.pass,
      },
      dependencies: {
        ok: dependencies.ok,
        errors: dependencies.errors,
        warnings: dependencies.warnings,
      },
    };
  }

  /**
   * Shadow execution — run a skill WITHOUT changing any production state.
   *
   * No `AgentSkillExecution` row, no `ModelUsage` row, and canonical
   * persistence runs in dry-run mode (validation only). Used by the
   * LegacyAgentAdapter for shadow migration.
   */
  async executeShadow(
    skillKey: string,
    input: SkillInput,
    options: { buildContext?: boolean } = {},
  ): Promise<{
    output: SkillOutput;
    promptVersion: string;
    latencyMs: number;
    validationFailures: number;
    tokens: number;
    model: string;
    costUsd: number;
  }> {
    const def = this.registry.getDefinition(skillKey);
    const startedAt = Date.now();
    const contextPackage: ContextPackage | undefined =
      input.contextPackage ??
      (options.buildContext === false
        ? undefined
        : await this.contextEngine.compile(defaultContextRequest(input, def)));

    const messages = this.buildMessages(def, input, contextPackage);
    const result = await this.llm.generateForcedStructured(
      messages,
      { toolName: def.tool?.name ?? `submit_${skillKey}_output`, schema: def.outputSchema },
      { agentKey: skillKey },
    );
    const output = this.parseOutput(result.content, def);
    const totalTokens = result.inputTokens + result.outputTokens;

    let validationFailures = 0;
    for (const artifact of output.artifacts) {
      try {
        await this.canonical.ingest(input.projectId, {
          externalId: artifact.externalId,
          kind: artifact.kind,
          title: artifact.title,
          summary: artifact.summary,
          status: 'CONFIRMED',
          provenance: {
            epistemicClass: artifact.epistemicClass,
            sources: artifact.sources,
            producedBy: skillKey,
            schemaVersion: def.version,
          },
          body: artifact.body,
        }, { dryRun: true });
      } catch {
        validationFailures += 1;
      }
    }

    return {
      output,
      promptVersion: `v${def.version}`,
      latencyMs: Date.now() - startedAt,
      validationFailures,
      tokens: totalTokens,
      model: result.model,
      costUsd: estimateCost(result.model, result.inputTokens, result.outputTokens).totalCostUsd,
    };
  }

  /** Build LLM messages from the PromptBuilder template registry. */
  private buildMessages(
    def: SkillDefinition,
    input: SkillInput,
    contextPackage?: ContextPackage,
  ): LLMMessage[] {
    try {
      return buildAgentMessages(def.key, {
        projectId: input.projectId,
        projectName: input.task.slice(0, 80),
        idea: input.task,
        knowledgeItems: (contextPackage?.relevantArtifacts ?? []).map((a) => ({
          externalId: a.source.externalId,
          type: String(a.source.kind),
          title: a.title,
          description: a.summary ?? null,
          status: 'DRAFT',
          source: a.source.producer ?? null,
        })),
        answeredQuestions: [],
      });
    } catch {
      // Template not yet registered for this skill key: minimal deterministic
      // system prompt so execution still works; the contract is still enforced
      // by the forced structured output tool.
      return [
        { role: 'system', content: `You are the ${def.name} skill (${def.key} v${def.version}). Produce structured output matching your output contract. Do not invent facts not present in the context.` },
        { role: 'user', content: input.task },
      ];
    }
  }

  private parseOutput(content: string, def: SkillDefinition): SkillOutput {
    const parsed = safeParse(content);
    if (!parsed) {
      throw new Error(`Skill '${def.key}' produced non-JSON output`);
    }
    const artifacts = Array.isArray(parsed.artifacts) ? parsed.artifacts : [];
    return {
      artifacts,
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
      validationIssues: Array.isArray(parsed.validationIssues) ? parsed.validationIssues : [],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 70,
      metadata: (parsed.metadata as Record<string, unknown> | undefined) ?? undefined,
    };
  }
}

function safeParse(content: string): Record<string, unknown> | null {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}
