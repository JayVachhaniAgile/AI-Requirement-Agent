/**
 * P2-1: Golden-dataset regression eval.
 *
 * Runs the full pipeline against each fixed test input and records parse
 * failures, retry counts, validator failures, ID-integrity violations, and
 * FR-count scaling. Run it before and after prompt/pipeline-logic changes to
 * confirm the change helps instead of just moving the failure mode.
 *
 * Prerequisites: backend running (`pnpm run dev`), PostgreSQL, and an LLM API
 * key configured.
 *
 * Usage:
 *   node eval/run-golden-eval.ts --dry-run
 *   node eval/run-golden-eval.ts [--base-url http://localhost:3000] [--input <id>] [--timeout-min 20] [--out <path>]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { GOLDEN_DATASET } from '../src/eval/golden-dataset.ts';
import {
  evaluateFrScaling,
  summarizeRunLogs,
  validateGoldenDataset,
} from '../src/eval/eval-metrics.ts';

interface Args {
  dryRun: boolean;
  baseUrl: string;
  input?: string;
  timeoutMin: number;
  out?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dryRun: argv.includes('--dry-run'),
    baseUrl: 'http://localhost:3000',
    timeoutMin: 20,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--base-url') args.baseUrl = argv[++i];
    if (flag === '--input') args.input = argv[++i];
    if (flag === '--timeout-min') args.timeoutMin = Number(argv[++i]);
    if (flag === '--out') args.out = argv[++i];
  }
  return args;
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      /* keep default */
    }
    throw new Error(`${init?.method ?? 'GET'} ${url} -> ${message}`);
  }
  return res.json() as Promise<unknown>;
}

const TERMINAL_STATUSES = ['COMPLETED', 'FAILED', 'CANCELLED', 'PAUSED'];

async function runInput(baseUrl: string, name: string, idea: string, timeoutMs: number) {
  const project = (await fetchJson(`${baseUrl}/api/projects`, {
    method: 'POST',
    body: JSON.stringify({ name, idea }),
  })) as { id: string };

  await fetchJson(`${baseUrl}/api/projects/${project.id}/start`, { method: 'POST' });

  const deadline = Date.now() + timeoutMs;
  let projectState: {
    id: string;
    status: string;
    errorMessage?: string | null;
    currentStage?: string | null;
  };

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    projectState = (await fetchJson(
      `${baseUrl}/api/projects/${project.id}`,
    )) as typeof projectState;

    if (projectState.status === 'WAITING_FOR_USER') {
      // Discovery checkpoint: confirm (no edits) to continue the pipeline.
      await fetchJson(`${baseUrl}/api/projects/${project.id}/discovery-confirmation`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      continue;
    }
    if (TERMINAL_STATUSES.includes(projectState.status)) break;
  }

  const final = (await fetchJson(`${baseUrl}/api/projects/${project.id}`)) as {
    status: string;
    errorMessage?: string | null;
    currentStage?: string | null;
  };
  const [knowledge, logs, executions, progress] = await Promise.all([
    fetchJson(`${baseUrl}/api/projects/${project.id}/knowledge`) as Promise<
      Array<{ type: string }>
    >,
    fetchJson(`${baseUrl}/api/projects/${project.id}/run-logs`) as Promise<
      Array<{ kind: string; agentKey: string; data?: Record<string, unknown> }>
    >,
    fetchJson(`${baseUrl}/api/projects/${project.id}/executions`) as Promise<
      Array<{ agentKey: string; status: string; retryCount?: number; error?: string | null }>
    >,
    fetchJson(`${baseUrl}/api/projects/${project.id}/progress`) as Promise<
      Array<{ stage: string; status: string; error?: string | null }>
    >,
  ]);

  const frCount = knowledge.filter((k) => k.type === 'FUNCTIONAL_REQUIREMENT').length;
  const featureCount = knowledge.filter((k) => k.type === 'FEATURE').length;
  const runLogSummary = summarizeRunLogs(logs);
  const frScaling = evaluateFrScaling(frCount, featureCount);

  return {
    projectId: project.id,
    status: final.status,
    errorMessage: final.errorMessage ?? null,
    parseFailures: runLogSummary.parseFailures,
    retryCount: runLogSummary.retries,
    retriesByAgent: runLogSummary.retriesByAgent,
    validatorFailures: runLogSummary.validationFailures,
    idIntegrityViolations: runLogSummary.idIntegrityViolations,
    paddingFlags: runLogSummary.paddingFlags,
    featureCount,
    frCount,
    frScaling,
    failedSteps: progress.filter((s) => s.status === 'FAILED').map((s) => s.stage),
    executionFailures: executions.filter((e) => e.status === 'FAILED').map((e) => e.agentKey),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const problems = validateGoldenDataset(GOLDEN_DATASET);
  if (problems.length > 0) {
    console.error('Golden dataset is invalid:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  if (args.dryRun) {
    console.log(`Golden dataset OK — ${GOLDEN_DATASET.length} inputs (5-10 required):`);
    for (const entry of GOLDEN_DATASET) {
      console.log(`  - ${entry.id}: ${entry.name} (${entry.description})`);
    }
    console.log('\nDry run complete. Point a running backend at --base-url to execute.');
    return;
  }

  try {
    await fetchJson(`${args.baseUrl}/api/healthz`);
  } catch (err) {
    console.error(`Cannot reach backend at ${args.baseUrl}: ${err}`);
    console.error('Start the backend (pnpm run dev) with PostgreSQL and an LLM key configured.');
    process.exit(1);
  }

  const selected = args.input ? GOLDEN_DATASET.filter((e) => e.id === args.input) : GOLDEN_DATASET;
  if (args.input && selected.length === 0) {
    console.error(`Unknown input id '${args.input}'.`);
    process.exit(1);
  }

  const timeoutMs = args.timeoutMin * 60 * 1000;
  const report: Array<Record<string, unknown>> = [];

  for (const entry of selected) {
    console.log(`\n=== Running: ${entry.id} (${entry.name}) ===`);
    const startedAt = Date.now();
    try {
      const result = await runInput(args.baseUrl, entry.name, entry.idea, timeoutMs);
      const elapsedMin = ((Date.now() - startedAt) / 60000).toFixed(1);
      report.push({ id: entry.id, elapsedMin: Number(elapsedMin), ...result });
      console.log(
        `  -> ${result.status} in ${elapsedMin}m | FR=${result.frCount} FEAT=${result.featureCount} ` +
          `retries=${result.retryCount} parse=${result.parseFailures} validator=${result.validatorFailures} ` +
          `idIntegrity=${result.idIntegrityViolations}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      report.push({ id: entry.id, status: 'ERROR', errorMessage: message });
      console.error(`  -> ERROR: ${message}`);
    }
  }

  const outPath =
    args.out ??
    join('eval', 'reports', `run-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), results: report }, null, 2),
  );
  console.log(`\nReport written to ${outPath}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
