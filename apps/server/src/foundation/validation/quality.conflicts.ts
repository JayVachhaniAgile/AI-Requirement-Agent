/**
 * Pure conflict detection (Phase 8).
 *
 * Two sources:
 *   1. Explicit `CONFLICTS_WITH` dependency edges between artifacts.
 *   2. Lexical contradiction scanning: artifacts whose text asserts competing
 *      positions on the same topic (e.g. requirement says OAuth, architecture
 *      says password-only).
 */
import type { EvaluatedArtifact } from './quality.types';

export interface ConflictFinding {
  artifactKeyA: string;
  artifactKeyB: string;
  topic: string;
  evidenceA: string;
  evidenceB: string;
}

export interface ConflictEdge {
  sourceArtifactKey: string;
  targetArtifactKey: string;
  reason?: string | null;
}

const TOPICS: Record<string, { positive: string[]; negative: string[] }> = {
  oauth: {
    positive: ['oauth', 'sso', 'openid', 'social login', 'google login', 'github login'],
    negative: ['password only', 'password-only', 'basic auth', 'no oauth', 'username/password only'],
  },
  mfa: {
    positive: ['multi-factor', 'mfa', '2fa', 'two-factor', 'totp'],
    negative: ['no mfa', 'no multi-factor', 'single factor'],
  },
  encryption: {
    positive: ['aes-256', 'encrypt at rest', 'end-to-end encryption', 'e2e'],
    negative: ['plaintext', 'unencrypted', 'no encryption'],
  },
};

function textOf(artifact: EvaluatedArtifact): string {
  return [
    artifact.title,
    artifact.summary ?? '',
    artifact.body ? JSON.stringify(artifact.body) : '',
  ]
    .join(' ')
    .toLowerCase();
}

/** Lexical conflict scan across a set of artifacts. */
export function detectLexicalConflicts(artifacts: EvaluatedArtifact[]): ConflictFinding[] {
  const findings: ConflictFinding[] = [];
  const entries = artifacts.map((a) => ({ artifact: a, text: textOf(a) }));
  for (const topic of Object.keys(TOPICS)) {
    const rule = TOPICS[topic];
    const positive = entries.filter((e) => rule.positive.some((kw) => e.text.includes(kw)));
    const negative = entries.filter((e) => rule.negative.some((kw) => e.text.includes(kw)));
    if (positive.length === 0 || negative.length === 0) continue;
    for (const pos of positive) {
      for (const neg of negative) {
        if (pos.artifact.id === neg.artifact.id) continue;
        findings.push({
          artifactKeyA: pos.artifact.id,
          artifactKeyB: neg.artifact.id,
          topic,
          evidenceA: excerpt(pos.text, rule.positive.find((kw) => pos.text.includes(kw)) ?? topic),
          evidenceB: excerpt(neg.text, rule.negative.find((kw) => neg.text.includes(kw)) ?? topic),
        });
      }
    }
  }
  return findings;
}

/** Normalize explicit CONFLICTS_WITH edges into findings. */
export function detectEdgeConflicts(
  artifacts: EvaluatedArtifact[],
  edges: ConflictEdge[],
): ConflictFinding[] {
  const byKey = new Map(artifacts.map((a) => [a.id, a]));
  const findings: ConflictFinding[] = [];
  for (const edge of edges) {
    const a = byKey.get(edge.sourceArtifactKey);
    const b = byKey.get(edge.targetArtifactKey);
    if (!a || !b) continue;
    findings.push({
      artifactKeyA: a.id,
      artifactKeyB: b.id,
      topic: 'conflicts_with',
      evidenceA: excerpt(textOf(a), 'conflicts_with'),
      evidenceB: edge.reason ?? excerpt(textOf(b), 'conflicts_with'),
    });
  }
  return findings;
}

export function detectConflicts(
  artifacts: EvaluatedArtifact[],
  edges: ConflictEdge[] = [],
): ConflictFinding[] {
  return [...detectLexicalConflicts(artifacts), ...detectEdgeConflicts(artifacts, edges)];
}

function excerpt(text: string, keyword: string, radius = 60): string {
  const idx = text.indexOf(keyword);
  if (idx === -1) return text.slice(0, radius);
  const start = Math.max(0, idx - radius);
  return text.slice(start, idx + radius + keyword.length).trim();
}
