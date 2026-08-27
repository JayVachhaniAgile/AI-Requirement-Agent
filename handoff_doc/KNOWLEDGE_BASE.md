# KNOWLEDGE_BASE.md — Structured Knowledge Base

> Typed items + typed edges are the primary source of truth. Documents are
> derived, versioned renderings of the knowledge graph.

## Status

| Component | Status |
|---|---|
| 3 new domains (`processes`, `business_rules`, `actors`) | **done** |
| Edge taxonomy (`edge-taxonomy.ts`, 17 relations) | **done** |
| `knowledge_edges` + `knowledge_embeddings` entities | **done** |
| `KnowledgeGraphService` (edge CRUD, neighbors, trace, retrieve, render-document) | **done** |
| REST API (`/api/projects/:id/kb`) | **done** |
| Retrieval (structured + keyword + graph + optional semantic) | **done** |
| Digest integration (`getDigestForConsumer` → `AGENT_DIGEST_CONFIG`) | **done** |
| Unit specs | **done** |
| Wired into `AppModule` + `DatabaseModule` | **done** |
| Embedding generation (LLM call) | **not started** (cosine retrieval ready) |

## Architecture

```
Agents / DAG engine
        |  writes items (POST /context/commits) + edges (POST /kb/edges)
        v
┌────────────────────────────────────────────────────────────┐
│ project_context_items (nodes)          knowledge_edges      │
│ 19 domains, versioned, provenance       typed, directed      │
│                                       knowledge_embeddings   │
└────────────────────────────────────────────────────────────┘
        |  reads
        v
KnowledgeGraphService
  ├─ getGraph / getNeighbors / trace   (graph traversal)
  ├─ retrieve                          (fused retrieval)
  └─ renderDocument                    (KB -> doc source snapshot)
        |
        v
Prompt Builder ContextResolver  ->  agents get context, not raw tables
```

## Knowledge Graph

- **Nodes** = `project_context_items` (domain, externalId, type, title, body, status, version, producer, metadata).
- **Edges** = `knowledge_edges`: `(project_id, source_id, target_id, relation)` unique — asserting the same edge again updates weight/metadata (supersede, not duplicate).
- Edges carry `producer_agent` + optional `commit_id` for provenance.

### Edge taxonomy (17 relations)

`part_of`, `contains`, `refines`, `elaborated_by`, `satisfies`, `depends_on`, `conflicts_with`, `constrains`, `applies_to`, `performs`, `involves`, `exposes`, `mitigated_by`, `raises`, `resolved_by`, `validates`, `supersedes`.

Example chain: `goal <-(satisfies) feature <-(contains) requirement <-(elaborated_by) user story`, plus `exposes -> risk`, `mitigated_by -> decision`, `raises -> question`, `resolved_by -> decision`.

## Database

### `knowledge_edges`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `project_id` | uuid | Indexed |
| `source_id` | uuid | Indexed, FK → items |
| `target_id` | uuid | Indexed, FK → items |
| `relation` | varchar(64) | Edge taxonomy |
| `weight` | real default 1 | Strength for ranking |
| `producer_agent` | varchar(100) | Who asserted the edge |
| `commit_id` | uuid | Context commit traceability |
| `metadata` | text | Rationale/evidence |
| `created_at` | timestamptz | |

Unique: `(project_id, source_id, target_id, relation)`.

### `knowledge_embeddings`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `item_id` | uuid | Unique, FK → items |
| `model` | varchar(64) | Embedding model |
| `embedding` | text | JSON array of numbers (pgvector-ready) |
| `created_at` / `updated_at` | timestamptz | |

Embedding **generation** is future work; retrieval already accepts an embedding vector and computes cosine similarity when stored embeddings exist.

## APIs

All under `/api/projects/:projectId/kb`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/edges` | Assert edges `{ edges: [{sourceId, targetId, relation, weight?, metadata?}], actorKey? }` |
| `DELETE` | `/edges/:edgeId` | Remove an edge |
| `GET` | `/edges?sourceId=&targetId=&relation=` | Query edges |
| `GET` | `/graph` | Full graph (nodes + edges) |
| `GET` | `/neighbors/:itemId?relation=&depth=` | BFS neighborhood (undirected) |
| `GET` | `/trace/:itemId?maxDepth=` | Up = items referencing the node; down = items the node references |
| `GET` | `/retrieve?query=&domains=&maxItems=&depth=` | Fused retrieval |
| `POST` | `/render-document` | KB source snapshot for a document type |

## Retrieval Strategy

Fused, deterministic, budget-bounded:

1. **Structured filter** — domain whitelist, `status != SUPERSEDED`.
2. **Keyword** — `query` matched against title/body/externalId → `+0.5 keyword`.
3. **Graph boost** — BFS neighborhood of keyword-matched seeds (up to `depth`) → `+0.3 graph`.
4. **Semantic** — if `embedding` supplied and stored embeddings exist → `+0.2 · cosine` (`semantic`).
5. **Rank** — score desc, then `updatedAt` desc; `maxItems` cap (default 50, max 200).

`getDigestForConsumer(projectId, consumerAgent, query?)` applies `AGENT_DIGEST_CONFIG` tiering on top — the ingest path for the Prompt Builder.

## Relationships & Conflict Rules

- Agents assert edges with `producer_agent` + optional `commit_id`.
- Edge endpoints validate both endpoints exist in the project and the relation is in the taxonomy.
- Item-level writes still go through `POST /context/commits` (optimistic locking + ownership) — the KB adds edges on top, reusing the same provenance model.

## Future Work

- Embedding generation (LLM) + pgvector column swap.
- `conflicts_with` surfaced to validation/debate agents.
- Edge-based gap-analysis proposals (apply/reject edges).
- WebSocket `kb.edge.updated` events.
