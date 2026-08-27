/**
 * Shared status vocabulary for the new architecture.
 *
 * Kept as plain constants so pure logic modules and services can reuse them
 * without importing TypeORM entities.
 */

export const ARTIFACT_STATUS = {
  DRAFT: 'DRAFT',
  GENERATING: 'GENERATING',
  REVIEW: 'REVIEW',
  APPROVED: 'APPROVED',
  ARCHIVED: 'ARCHIVED',
} as const;

export const QUALITY_CHECK_STATUS = {
  PENDING: 'PENDING',
  PASS: 'PASS',
  FAIL: 'FAIL',
  ERROR: 'ERROR',
} as const;

export const EXECUTION_STATUS = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
} as const;

export const WORKFLOW_EXECUTION_STATUS = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

export const MODEL_TIERS = ['high', 'standard', 'fast'] as const;

export const STRUCTURED_MODES = ['forced-tools', 'json-object', 'prompt-only'] as const;
