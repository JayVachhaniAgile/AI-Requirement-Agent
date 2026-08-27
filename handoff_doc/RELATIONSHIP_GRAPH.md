# RELATIONSHIP_GRAPH.md — Relationship Graph

> The canonical specialization of the Structured Knowledge Base: typed nodes
> (12 kinds) connected by a defined relation taxonomy, with purpose-built
> traversal views for traceability, impact analysis, dependency visualization,
> change propagation, and search. No new tables — nodes are
> `project_context_items`, edges are `knowledge_edges`.

## Status

| Component | Status |
|---|---|
| 5 new domains (`epics`, `apis`, `database_tables`, `ui_screens`, `test_cases`) | **done** |
| 7 new relations (`drives`, `defines`, `implemented_by`, `maps_to`, `rendered_by`, `verified_by`, `covered_by`) | **done** |
| Layer mapping (`relationship-layers.ts`, 6 layers) | **done** |
| `getLayeredGraph` / `getImpactAnalysis` / `propagate` / `getTraceabilityMatrix` / `relationshipSearch` | **done** |
| REST API (`/api/projects/:id/relationships`) | **done** |
| Unit specs | **done** |
| Wired into `AppModule` | **done** |
| `conflicts_with` surfaced to validation/debate | **done** |
| UI visualization (frontend Relationships tab) | **done** |

## Graph Model

### Node kinds → domains (24 domains)

| Kind | Domain |
|---|---|
| Business Goal | `business_goals` |
| Epic | `epics` |
| Feature | `features` |
| Requirement | `functional_requirements` / `non_functional_requirements` |
| User Story | `user_stories` |
| Acceptance Criterion | `acceptance_criteria` |
| API | `apis` |
| Database Table | `database_tables` |
| UI Screen | `ui_screens` |
| Test Case | `test_cases` |
| Risk | `risks` |
| Document | `document_summaries` |

### Canonical traceability chain

```
goal -(drives)-> epic -(contains)-> feature -(contains)-> requirement
  -(elaborated_by)-> user story -(defines)-> acceptance criterion
requirement -(implemented_by)-> api
feature/requirement -(maps_to)-> db table
feature/requirement -(rendered_by)-> ui screen
requirement/story -(verified_by)-> test case
feature/requirement -(exposes)-> risk
item -(covered_by)-> document
```

### Relations (24 total)

Existing: `part_of`, `contains`, `refines`, `elaborated_by`, `satisfies`, `depends_on`, `conflicts_with`, `constrains`, `applies_to`, `performs`, `involves`, `exposes`, `mitigated_by`, `raises`, `resolved_by`, `validates`, `supersedes`.

New: `drives` (goal → epic), `defines` (story → acceptance criterion), `implemented_by` (requirement → api), `maps_to` (feature/requirement → db table), `rendered_by` (feature/requirement → ui screen), `verified_by` (requirement/story → test case), `covered_by` (item → document).

## Layers (derived, not stored)

`relationship-layers.ts` maps every domain to one of 6 layers:

`business` → `product` → `requirements` → `architecture` (Design & Architecture) → `delivery` → `cross-cutting`.

## Database Design

No new tables. Nodes = `project_context_items` (24 domains); edges = `knowledge_edges` with the extended taxonomy. The unique `(project_id, source_id, target_id, relation)` key and `producer_agent`/`commit_id` provenance are unchanged.

## APIs

All under `/api/projects/:projectId/relationships`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/types` | Layers, domain→layer mapping, relation taxonomy |
| `GET` | `/graph?layers=` | Layered graph payload for visualization |
| `GET` | `/:itemId/trace?maxDepth=` | Up (referencing) + down (referenced) trace |
| `GET` | `/:itemId/impact?maxDepth=` | Forward closure + affected documents/risks |
| `GET` | `/:itemId/propagate?direction=&depth=&relations=` | Change propagation + severity |
| `GET` | `/matrix` | Traceability matrix with coverage + gaps |
| `GET` | `/search?query=&domains=&maxItems=` | Relationship-aware search |
| `GET` | `/conflicts` | All `conflicts_with` pairs (validation/debate input) |

## Graph Traversal Algorithms

All BFS over the KB adjacency (out/in maps), direction-aware, depth-bounded.

1. **Traceability** — directed BFS: `up` = incoming edges (who references this), `down` = outgoing (what this references).
2. **Impact analysis** — forward closure over ALL outgoing relations → `{ impacted, documents, risks, blastRadius }`. Documents = reached `document_summaries` nodes; risks = reached `risks` nodes.
3. **Change propagation** — parameterized closure (`direction: up|down|both`, `depth`, `relations` filter) → `severity = delivery-layer leaves + affected documents`.
4. **Traceability matrix** — per requirement: `story? acceptance? api? dbTable? uiScreen? testCase?` → coverage % + explicit gaps (feeds gap-analysis).
5. **Search** — fused `retrieve()` + 1-hop relation annotation on every hit.

## UI Visualization

Implemented as a **Relationships tab** in the project workspace (React + Tailwind, no new dependencies):

- `TabRelationships` renders the layered graph (business → product → requirements → architecture → delivery → cross-cutting) as layer columns with node chips, plus an edge list.
- Conflicts panel lists `conflicts_with` pairs with reasons.
- Traceability matrix summary (requirements count, average coverage, gap count) linking conceptually to gap-analysis.

Backend already exposes the data for richer views (impact, propagate, trace, search); a Cytoscape.js/ReactFlow upgrade with click-to-highlight propagation is future work.

## Future Work

- Richer frontend interactions (click node → impact highlight, propagation panel) via Cytoscape.js/ReactFlow.
- Document staleness auto-flag when `covered_by` items change.
- Edge proposals in gap-analysis.
