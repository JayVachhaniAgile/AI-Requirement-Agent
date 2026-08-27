/**
 * In-memory LRU cache for compiled context packages.
 *
 * Cache key = hash(ContextRequest) + ":" + sourceFingerprint (concatenated
 * source versions). Same request + unchanged sources → cache hit. When any
 * source artifact version bumps, the cache invalidates for every request that
 * included it.
 */
import { createHash } from 'crypto';
import type { ContextCompileResult, ContextPackage, ContextRequest, ContextSourceRef } from './context.types';

export interface CacheOptions {
  maxEntries?: number;
  /** Optional clock for testing. */
  now?: () => Date;
}

interface Entry {
  result: ContextCompileResult;
  storedAt: string;
}

export class ContextCache {
  private readonly entries = new Map<string, Entry>();
  private readonly maxEntries: number;
  private readonly now: () => Date;

  constructor(options: CacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 64;
    this.now = options.now ?? (() => new Date());
  }

  static buildKey(request: ContextRequest, sourceFingerprint: string): string {
    const reqHash = createHash('sha1').update(stableStringify(request)).digest('hex').slice(0, 16);
    return `${reqHash}:${sourceFingerprint}`;
  }

  static sourceFingerprint(refs: ContextSourceRef[]): string {
    return refs
      .slice()
      .sort((a, b) => `${a.externalId}|${a.kind}`.localeCompare(`${b.externalId}|${b.kind}`))
      .map((r) => `${r.externalId}|${r.kind}|${r.version ?? '0'}`)
      .join(';');
  }

  get(key: string): ContextCompileResult | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    // LRU touch
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.result;
  }

  put(key: string, result: ContextCompileResult): void {
    if (this.entries.has(key)) this.entries.delete(key);
    this.entries.set(key, { result, storedAt: this.now().toISOString() });
    if (this.entries.size > this.maxEntries) {
      const firstKey = this.entries.keys().next().value;
      if (firstKey !== undefined) this.entries.delete(firstKey);
    }
  }

  invalidate(predicate: (ref: ContextSourceRef) => boolean): number {
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (entry.result.package.sourceReferences.some(predicate)) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  clear(): void {
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}

export function packageFromCache(pkg: ContextPackage): ContextPackage {
  return { ...pkg, cached: true };
}
