# CRYSTALLIZE_FIXES.md — Issues, Gaps, and Token Optimization Fixes

> Source: review of `FULL_SYSTEM_FLOW.md`. Each item includes what's wrong, why it matters, and the concrete fix. Ordered by priority within each section.

---

## 1. Documentation / Logic Inconsistencies (verify against actual code — these usually indicate real bugs)

| # | Issue | Location | Fix |
|---|---|---|---|
| **1.1** | Layer count mismatch: intro says "8 layers," Pipeline Layer Map table shows **9** | `handoff_doc/CONTEXT.md §3 intro vs `handoff_doc/WORKFLOW_RULES.md` table | Verify `generatePlan()` output directly. Update the stale prose (intro) to reflect the actual 9‑layer DAG, and ensure any generated diagrams match the table.
| **1.2** | Document generator count mismatch: §8 says "seven," Layer Map table implies "6 + build‑prompt" | `handoff_doc/CONTEXT.md §8 vs `handoff_doc/WORKFLOW_RULES.md` | Confirm in code whether `gap-analysis` depends on `build‑prompt` completing. If not, adjust the dependency list to remove the implicit dependency and update the docs accordingly.
| **1.3** | Domain detection runs twice: once in `DomainService.detectDomain()` at project creation, again implicitly inside the Discovery agent | `apps/server/src/services/domain.service.ts` vs Agent Table #1 | Keep only the Discovery agent's detection (it has full idea context). Remove or make the early `DomainService` call a no‑op, or have Discovery reuse the stored domain instead of re‑detecting. This removes one full LLM call per project.

---

## 2. Reliability Gaps (missing requirements — add these before scaling users)

| # | Gap | Risk | Fix |
|---|---|---|---|
| **2.1** | No idempotency guard on `startProject()` / Start button | Double‑click or duplicate request race can spin up two runs before `cancelActiveRuns()` resolves → duplicate LLM spend, corrupted node state | Add a DB‑level unique constraint (e.g., `project_id + status = 'RUNNING'` unique) **or** a short‑lived lock (Redis/in‑memory mutex keyed by `projectId`) around `startProject()`. Reject a second call while one is in‑flight.
| **2.2** | Node timeout behavior undefined (`timeoutMs` is set but "then what" isn’t specified) | Silent stuck runs in production with no automated recovery | In `DagEngineService.executeFromLevel()`, when a node exceeds `timeoutMs`, mark the node `FAILED` with `error: "TIMEOUT"` and trigger the same failure path as a normal agent error (so `regenerateNode` can recover it). Also emit a `dag.node.updated` event.
| **2.3** | Retry on Zod validation failure resends full original agent context | On a 6000‑token RE agent call, 1 failed validation = ~3× token cost for that call alone | When retrying, send only `{ schema, validationError, malformedOutput }` instead of the full `AgentContext`. Implement this in `AgentRunnerService`.
| **2.4** | Validation (8d) and Debate (8e) ingest **all** knowledge items with no chunking/summarization | Won’t scale past ~15‑20 features; already your most expensive stages (high tier, 4000‑5000 tokens) | Pre‑filter before these stages (see 3.1). Only send flagged/conflicting/low‑confidence items.
| **2.5** | No rate‑limit/backoff handling for parallel LLM calls | Layer 6 (3 parallel) and Layer 9 (7 parallel) will get throttled on any rate‑limited provider (esp. Groq free tier) | Add exponential backoff + queue‑based throttling in `DagEngineService`’s batch executor. Respect `Retry‑After` headers.
| **2.6** | Zero token/cost instrumentation anywhere in the pipeline | Can’t optimize what isn’t measured — no way to know which of the 23 agents is actually burning tokens | Log `{ agentKey, promptTokens, completionTokens, retryCount, model }` per node execution to a new `token_usage` table. Do this **before** any other optimization.
| **2.7** | `concurrency=3` DAG scheduler is fake parallelism on Ollama — a single GPU serializes requests regardless of batch size | You’re carrying the complexity cost of a parallel scheduler without the throughput benefit. Wall‑clock time estimates for Layer 6 (3 parallel) or Layer 9 (7 parallel) assume real concurrency, they’re wrong on current infra | Either (a) don’t rely on parallel wall‑clock savings until you migrate to a provider that actually serves concurrent requests, **or** (b) if staying on Ollama short‑term, set `concurrency=1` to stop wasting scheduler complexity.

---

## 3. Token Optimization Fixes (ranked by impact)

| # | Fix | Where | Expected Impact |
|---|---|---|---|
| **3.1** | **Pre‑filter before Validation/Debate**. Run a cheap deterministic or fast‑tier pass to select only flagged/conflicting/low‑confidence items, then send only that subset to the high‑tier model. | `CriticService`, `DebateService` context builder | Likely **60‑80 % token cut** on your two most expensive calls (both high‑tier, full knowledge base).
| **3.2** | **Trim retry payloads**. On Zod validation failure, send only the schema + validation error + malformed output — not the full original `AgentContext`. | Wherever retries are triggered (`AgentRunnerService`) | Cuts retry cost from ~3× to ~1.2‑1.4× per failed call.
| **3.3** | **Stop sending full fact dumps to Compilation**. It only needs to produce a 250‑400 word executive summary — feed it condensed bullets, not full‑detail knowledge items from 6 upstream agents. | `CompilerService` | Large cut on one of the highest input‑token, lowest‑output‑token calls in the pipeline.
| **3.4** | **Enable prompt caching** once migrated to a hosted Claude model. Split context into a stable block (project idea, domain, confirmed discovery facts — reused across most of the 23 calls) and a variable block (per‑agent specifics). | `buildContext()` / `AGENT_DIGEST_CONFIG` | Biggest single lever once off Ollama — architectural right time to do it.
| **3.5** | **Deduplicate domain detection** (same fix as 1.3). | `DomainService` / `DiscoveryService` | One fewer LLM call per project, guaranteed win.
| **3.6** | **Make SOW chunk size dynamic** instead of fixed at 3 features/chunk. Size chunks to the model’s actual context budget. | `SowService` | A 21‑feature project currently costs 7 chunk calls + 1 merge = 8 calls. Dynamic sizing can cut this to 3‑4 calls depending on model.
| **3.7** | **Right‑size security‑review's token budget**. It’s standard tier / 3000 tokens but covers 6 sub‑domains (auth, OWASP, encryption, API sec, compliance, threat model) — ~500 tokens each. Either bump to `high` tier or split into 2 calls so each sub‑domain gets adequate depth. | `agent-model.config.ts` | Improves security coverage quality and reduces token waste.

---

## 4. Suggested Priority Order

1. **2.6** — Add token/cost logging first. You need the baseline before anything else is provably an improvement.
2. **3.2** — Trim retry payloads. Small code change, immediate savings, fixes a real bug.
3. **1.3 / 3.5** — Deduplicate domain detection. Trivial fix, guaranteed win.
4. **3.1** — Pre‑filter Validation/Debate context. Biggest single token win, moderate effort.
5. **3.3** — Fix Compilation's context bloat.
6. **2.1, 2.2, 2.5, 2.7** — Reliability guards (idempotency, timeout handling, backoff, real‑vs‑fake concurrency) — do before scaling users, not urgent for solo use.
7. **3.4** — Prompt caching — do this *as part of* the Ollama → hosted migration, not before.
8. **3.6, 3.7** — Lower‑impact tuning once the above are in place.

---

## 5. Verification Checklist (once fixes are applied)

- [ ] Layer count in code matches doc (fix whichever was wrong)
- [ ] `gap-analysis` dependency list includes `build‑prompt`
- [ ] Only one domain‑detection LLM call per project
- [ ] Retry calls measurably smaller than initial calls (check token logs)
- [ ] Validation/Debate input token count drops after pre‑filtering
- [ ] Token usage table populated for all 23 agents, at least one full run
- [ ] Double‑start of a project is rejected, not duplicated
- [ ] Timed‑out nodes reach `FAILED` state and are regenerable

---

*All fixes should be accompanied by unit‑ and integration‑tests where applicable (see `handoff_doc/SMOKE_TESTS.md`).*
