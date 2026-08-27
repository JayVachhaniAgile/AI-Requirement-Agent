import type { ContextOperation } from './context-domains';
import { isContextDomain, isContextOperation } from './context-domains';

/** Content payload for a context item write. */
export interface ContextItemInput {
  type?: string;
  title: string;
  body?: string | null;
  status?: string;
  relatedIds?: string[];
  metadata?: Record<string, unknown> | null;
}

/** One change inside a context commit. */
export interface ContextChange {
  domain: string;
  operation: ContextOperation;
  externalId: string | null;
  item?: ContextItemInput;
  /** Item version the writer last read; optimistic-lock guard. */
  expectedVersion?: number;
  reason?: string;
}

export interface CommitActor {
  type: 'agent' | 'user' | 'system';
  key: string;
}

/** The subset of a live item needed to make conflict decisions. */
export interface ExistingContextItem {
  id: string;
  domain: string;
  externalId: string | null;
  version: number;
  status: string;
  producerAgent: string | null;
}

export type ApplyMode = 'create' | 'update' | 'supersede' | 'delete' | 'noop';

export interface ApplyPlan {
  change: ContextChange;
  existing: ExistingContextItem | null;
  mode: ApplyMode;
  nextVersion: number;
}

export type ConflictCode =
  | 'version_conflict'
  | 'ownership'
  | 'flagged'
  | 'missing_external_id'
  | 'unknown_domain'
  | 'unknown_operation'
  | 'exists'
  | 'missing_item';

export interface ResolvedConflict {
  domain: string;
  externalId: string | null;
  code: ConflictCode;
  message: string;
  currentVersion?: number;
  expectedVersion?: number;
  producerAgent?: string | null;
}

export interface ResolveResult {
  plans: ApplyPlan[];
  conflicts: ResolvedConflict[];
}

export function contextKey(domain: string, externalId: string | null): string {
  return `${domain}|${externalId ?? ''}`;
}

/**
 * Decide which changes may be applied and which must conflict.
 *
 * Rules (see handoff_doc/PROJECT_CONTEXT.md § Conflict Resolution):
 * - Items are keyed by (domain, externalId); `expectedVersion` is the
 *   optimistic-lock guard (missing = no version check).
 * - Agents may freely update items they produced. Foreign items may only be
 *   `supersede`d (with the new content carrying provenance), never silently
 *   upserted or deleted.
 * - `FLAGGED` items are read-only for agents; only `user`/`system` actors may
 *   touch them.
 * - `create` on an existing item is an idempotent no-op when the same producer
 *   retries with a matching version — safe under P0-2/P0-3 retries.
 */
export function resolveChanges(
  changes: ContextChange[],
  existingByKey: Map<string, ExistingContextItem>,
  actor: CommitActor,
): ResolveResult {
  const plans: ApplyPlan[] = [];
  const conflicts: ResolvedConflict[] = [];
  const actorIsUser = actor.type !== 'agent';

  for (const change of changes) {
    const domain = change.domain;
    const externalId = change.externalId;

    if (!externalId) {
      conflicts.push({
        domain,
        externalId: null,
        code: 'missing_external_id',
        message: 'externalId is required for context changes',
      });
      continue;
    }
    if (!isContextDomain(domain)) {
      conflicts.push({
        domain,
        externalId,
        code: 'unknown_domain',
        message: `unknown context domain: ${domain}`,
      });
      continue;
    }
    if (!isContextOperation(change.operation)) {
      conflicts.push({
        domain,
        externalId,
        code: 'unknown_operation',
        message: `unknown operation: ${String(change.operation)}`,
      });
      continue;
    }

    const existing = existingByKey.get(contextKey(domain, externalId)) ?? null;
    const versionOk =
      change.expectedVersion == null || (existing && change.expectedVersion === existing.version);

    switch (change.operation) {
      case 'create': {
        if (!change.item?.title) {
          conflicts.push({
            domain,
            externalId,
            code: 'missing_item',
            message: 'create requires item content with a title',
          });
          continue;
        }
        if (!existing) {
          plans.push({ change, existing: null, mode: 'create', nextVersion: 1 });
          continue;
        }
        // Idempotent retry: same producer + matching version -> safe no-op.
        if (existing.producerAgent === actor.key && versionOk) {
          plans.push({ change, existing, mode: 'noop', nextVersion: existing.version });
          continue;
        }
        conflicts.push({
          domain,
          externalId,
          code: 'exists',
          message: `item ${domain}:${externalId} already exists`,
          currentVersion: existing.version,
          producerAgent: existing.producerAgent,
        });
        continue;
      }
      case 'upsert': {
        if (!existing) {
          if (!change.item?.title) {
            conflicts.push({
              domain,
              externalId,
              code: 'missing_item',
              message: 'upsert on a new item requires item content with a title',
            });
            continue;
          }
          plans.push({ change, existing: null, mode: 'create', nextVersion: 1 });
          continue;
        }
        const guard = ownershipGuard(existing, change, actor);
        if (guard) {
          conflicts.push(guard);
          continue;
        }
        if (!change.item) {
          conflicts.push({
            domain,
            externalId,
            code: 'missing_item',
            message: 'upsert requires item content',
          });
          continue;
        }
        plans.push({ change, existing, mode: 'update', nextVersion: existing.version + 1 });
        continue;
      }
      case 'delete': {
        if (!existing) {
          // Idempotent: deleting something that is already gone is a no-op.
          plans.push({ change, existing: null, mode: 'noop', nextVersion: 0 });
          continue;
        }
        const guard = ownershipGuard(existing, change, actor);
        if (guard) {
          conflicts.push(guard);
          continue;
        }
        plans.push({ change, existing, mode: 'delete', nextVersion: existing.version + 1 });
        continue;
      }
      case 'supersede': {
        if (!existing) {
          if (!change.item?.title) {
            conflicts.push({
              domain,
              externalId,
              code: 'missing_item',
              message: 'supersede requires item content with a title',
            });
            continue;
          }
          plans.push({ change, existing: null, mode: 'create', nextVersion: 1 });
          continue;
        }
        if (existing.status === 'FLAGGED' && !actorIsUser) {
          conflicts.push({
            domain,
            externalId,
            code: 'flagged',
            message: `item ${domain}:${externalId} is FLAGGED and read-only for agents`,
            producerAgent: existing.producerAgent,
            currentVersion: existing.version,
          });
          continue;
        }
        if (!versionOk) {
          conflicts.push({
            domain,
            externalId,
            code: 'version_conflict',
            message: `item ${domain}:${externalId} changed since it was read`,
            currentVersion: existing.version,
            expectedVersion: change.expectedVersion,
          });
          continue;
        }
        if (!change.item?.title) {
          conflicts.push({
            domain,
            externalId,
            code: 'missing_item',
            message: 'supersede requires item content with a title',
          });
          continue;
        }
        plans.push({ change, existing, mode: 'supersede', nextVersion: existing.version + 1 });
        continue;
      }
    }
  }

  return { plans, conflicts };
}

function ownershipGuard(
  existing: ExistingContextItem,
  change: ContextChange,
  actor: CommitActor,
): ResolvedConflict | null {
  if (existing.status === 'FLAGGED' && actor.type === 'agent') {
    return {
      domain: existing.domain,
      externalId: existing.externalId,
      code: 'flagged',
      message: `item ${existing.domain}:${existing.externalId} is FLAGGED and read-only for agents`,
      producerAgent: existing.producerAgent,
      currentVersion: existing.version,
    };
  }
  if (existing.producerAgent !== actor.key && actor.type === 'agent') {
    return {
      domain: existing.domain,
      externalId: existing.externalId,
      code: 'ownership',
      message: `item produced by ${existing.producerAgent ?? 'unknown'}; agents may only supersede foreign items`,
      producerAgent: existing.producerAgent,
      currentVersion: existing.version,
    };
  }
  if (change.expectedVersion != null && change.expectedVersion !== existing.version) {
    return {
      domain: existing.domain,
      externalId: existing.externalId,
      code: 'version_conflict',
      message: `item ${existing.domain}:${existing.externalId} changed since it was read`,
      currentVersion: existing.version,
      expectedVersion: change.expectedVersion,
      producerAgent: existing.producerAgent,
    };
  }
  return null;
}
