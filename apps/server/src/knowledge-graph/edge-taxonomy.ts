/**
 * Knowledge graph edge taxonomy. Relations are typed, directed, and carry
 * provenance; they encode how the structured knowledge base connects.
 */

export const EDGE_RELATIONS = [
  'part_of',
  'contains',
  'refines',
  'elaborated_by',
  'satisfies',
  'depends_on',
  'conflicts_with',
  'constrains',
  'applies_to',
  'performs',
  'involves',
  'exposes',
  'mitigated_by',
  'raises',
  'resolved_by',
  'validates',
  'supersedes',
  'drives',
  'defines',
  'implemented_by',
  'maps_to',
  'rendered_by',
  'verified_by',
  'covered_by',
] as const;

export type EdgeRelation = (typeof EDGE_RELATIONS)[number];

export const EDGE_LABELS: Record<EdgeRelation, string> = {
  part_of: 'Part of',
  contains: 'Contains',
  refines: 'Refines',
  elaborated_by: 'Elaborated by',
  satisfies: 'Satisfies',
  depends_on: 'Depends on',
  conflicts_with: 'Conflicts with',
  constrains: 'Constrains',
  applies_to: 'Applies to',
  performs: 'Performs',
  involves: 'Involves',
  exposes: 'Exposes',
  mitigated_by: 'Mitigated by',
  raises: 'Raises',
  resolved_by: 'Resolved by',
  validates: 'Validates',
  supersedes: 'Supersedes',
  drives: 'Drives',
  defines: 'Defines',
  implemented_by: 'Implemented by',
  maps_to: 'Maps to',
  rendered_by: 'Rendered by',
  verified_by: 'Verified by',
  covered_by: 'Covered by',
};

export function isEdgeRelation(value: string): value is EdgeRelation {
  return (EDGE_RELATIONS as readonly string[]).includes(value);
}
