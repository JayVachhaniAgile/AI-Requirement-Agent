/**
 * Shadow-migration types (Phase 6).
 */
import type { MigrationMode } from './migration.config';

export interface AgentOutputSummary {
  /** Number of artifacts/items produced. */
  artifactCount: number;
  /** Mean confidence (0-100) of the produced items. */
  confidence: number;
  /** Token usage for the run (0 when unavailable). */
  tokens: number;
  /** Wall-clock latency in ms. */
  latencyMs: number;
  /** Estimated cost in USD (0 when unavailable). */
  costUsd: number;
  /** Quality score (0-100) when available. */
  qualityScore: number | null;
  /** Number of validation failures observed. */
  validationFailures: number;
  /** Titles/externalIds of produced items (used for coverage). */
  itemKeys: string[];
  /** Character length of textual output (documents) or 0. */
  contentLength: number;
}

export interface ComparisonMetrics {
  /** 0-1 — skill artifact count relative to legacy. */
  completeness: number;
  /** 0-1 — share of legacy item keys reproduced by the skill. */
  coverage: number;
  /** 0-1 — share of legacy item keys NOT reproduced by the skill. */
  missingInformation: number;
  /** Number of keys present in both with conflicting confidence (> 20 pts). */
  contradictions: number;
  /** skill confidence − legacy confidence. */
  confidenceDelta: number;
  /** skill artifactCount − legacy artifactCount. */
  artifactCountDelta: number;
  /** skill qualityScore − legacy qualityScore (null-safe). */
  qualityScoreDelta: number | null;
  /** skill tokens − legacy tokens. */
  tokenDelta: number;
  /** skill latencyMs − legacy latencyMs. */
  latencyDelta: number;
  /** skill costUsd − legacy costUsd. */
  costDelta: number;
  /** skill validationFailures − legacy validationFailures. */
  validationFailuresDelta: number;
}

export interface MigrationVerdict {
  canMigrate: boolean;
  /** Per-check booleans — the migration rule from the Phase 6 spec. */
  checks: {
    schemaPasses: boolean;
    qualityPasses: boolean;
    noCriticalRegression: boolean;
    requiredArtifacts: boolean;
    costLatencyAcceptable: boolean;
  };
  /** Human-readable reasons when `canMigrate` is false. */
  blockers: string[];
}

export interface ComparisonRecord {
  projectId: string;
  workflowExecutionId?: string;
  agentKey: string;
  batch: number | null;
  mode: MigrationMode;
  legacy: AgentOutputSummary;
  skill: AgentOutputSummary;
  metrics: ComparisonMetrics;
  verdict: MigrationVerdict;
  createdAt: Date;
}
