import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DiscoveryCheckpointService } from './discovery-checkpoint.service';
import type { DiscoveryCheckpoint } from '../database/entities';

interface FakeRepo {
  findOne: (opts: unknown) => Promise<unknown>;
  find: (opts: unknown) => Promise<unknown[]>;
  create: (data: unknown) => unknown;
  save: (data: unknown) => Promise<unknown>;
}

function makeRepo(overrides: Partial<FakeRepo> = {}): FakeRepo {
  return {
    findOne: async () => null,
    find: async () => [],
    create: (data: unknown) => data,
    save: async (data: unknown) => data,
    ...overrides,
  };
}

/** Fake repo backed by an in-memory array that honours `where` filters. */
function makeArrayRepo<T extends Record<string, unknown>>(rows: T[]): FakeRepo {
  return {
    findOne: async (opts: { where?: Record<string, unknown> }) =>
      rows.find((row) =>
        Object.entries(opts.where ?? {}).every(([key, value]) => row[key] === value),
      ) ?? null,
    find: async (opts: { where?: Record<string, unknown> }) =>
      rows.filter((row) =>
        Object.entries(opts.where ?? {}).every(([key, value]) => row[key] === value),
      ),
    create: (data: unknown) => data,
    save: async (data: unknown) => data,
  };
}

const CHECKPOINT: Partial<DiscoveryCheckpoint> = {
  id: 'cp-1',
  projectId: 'p-1',
  ideaInterpretation: 'original interpretation',
  problemStatement: 'original problem',
  proposedSolution: 'original solution',
  initialScope: 'original scope',
  blockingQuestionsJson: '[]',
  status: 'PENDING',
};

function makeService(overrides: { checkpoint?: FakeRepo; questions?: FakeRepo } = {}) {
  return new DiscoveryCheckpointService(
    overrides.checkpoint as never,
    overrides.questions as never,
  );
}

test('confirm refuses while a blocking question is still pending', async () => {
  const service = makeService({
    checkpoint: makeRepo({
      findOne: async () => ({ ...CHECKPOINT }),
      save: async (v: unknown) => v,
    }),
    questions: makeRepo({
      find: async () => [
        {
          id: 'q1',
          projectId: 'p-1',
          question: 'Who is the target user?',
          isBlocking: true,
          status: 'PENDING',
          answer: null,
        },
      ],
    }),
  });

  await assert.rejects(
    service.confirm('p-1', {}),
    (err: unknown) =>
      err instanceof BadRequestException && /Blocking questions must be answered/.test(err.message),
  );
});

test('confirm saves edits, marks CONFIRMED, and resumes as canProceed', async () => {
  const saved: Array<Record<string, unknown>> = [];
  const row: Record<string, unknown> = { ...CHECKPOINT };
  const checkpoint = makeArrayRepo([row]);
  checkpoint.save = async (v: Record<string, unknown>) => {
    Object.assign(row, v);
    saved.push(v);
    return v;
  };
  const questions = makeArrayRepo([
    {
      id: 'q1',
      projectId: 'p-1',
      question: 'Q',
      isBlocking: true,
      status: 'ANSWERED',
      answer: 'The users are admins',
    },
  ]);
  const service = makeService({
    checkpoint,
    questions,
  });

  const view = await service.confirm('p-1', {
    ideaInterpretation: '  corrected interpretation  ',
  });

  assert.equal(view.status, 'CONFIRMED');
  assert.equal(view.ideaInterpretation, 'corrected interpretation');
  assert.equal(view.problemStatement, 'original problem');
  assert.equal(view.canProceed, true);
  assert.equal(saved[0].status, 'CONFIRMED');
});

test('getByProject reports canProceed=false while blocking questions are pending', async () => {
  const questions = makeArrayRepo([
    {
      id: 'q1',
      projectId: 'p-1',
      question: 'Q',
      isBlocking: true,
      status: 'PENDING',
      answer: null,
    },
  ]);
  const service = makeService({
    checkpoint: makeRepo({
      findOne: async () => ({ ...CHECKPOINT }),
    }),
    questions,
  });

  const view = await service.getByProject('p-1');
  assert.equal(view.canProceed, false);
  assert.equal(view.blockingQuestions.length, 0);
});

test('getByProject throws NotFound when no checkpoint exists', async () => {
  const service = makeService({ checkpoint: makeRepo() });
  await assert.rejects(service.getByProject('p-1'), NotFoundException);
});

test('upsert stores a fresh PENDING checkpoint (overwrites previous)', async () => {
  const saved: Array<Record<string, unknown>> = [];
  const service = makeService({
    checkpoint: makeRepo({
      findOne: async () => ({ ...CHECKPOINT, status: 'CONFIRMED' }),
      save: async (v: Record<string, unknown>) => {
        saved.push(v);
        return v;
      },
    }),
  });

  await service.upsert('p-1', {
    ideaInterpretation: 'new',
    problemStatement: 'new problem',
    proposedSolution: 'new solution',
    initialScope: 'new scope',
    blockingQuestions: [{ question: 'Q?', isBlocking: true }],
  });

  assert.equal(saved[0].status, 'PENDING');
  assert.equal(saved[0].ideaInterpretation, 'new');
  assert.equal(
    saved[0].blockingQuestionsJson,
    JSON.stringify([{ question: 'Q?', isBlocking: true }]),
  );
});
