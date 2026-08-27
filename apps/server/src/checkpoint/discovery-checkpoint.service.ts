import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { DiscoveryCheckpoint, ClarificationQuestion } from '../database/entities';
import type { DiscoveryCheckpointData } from '../agents/types';

export interface DiscoveryCheckpointView {
  id: string;
  projectId: string;
  ideaInterpretation: string;
  problemStatement: string;
  proposedSolution: string;
  initialScope: string | null;
  status: string;
  blockingQuestions: Array<{ question: string; context?: string | null; isBlocking: boolean }>;
  questions: Array<{
    id: string;
    question: string;
    context: string | null;
    isBlocking: boolean;
    status: string;
    answer: string | null;
  }>;
  canProceed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Persists the Discovery human-in-the-loop checkpoint (P0-4). The pipeline
 * pauses after Discovery; the user confirms/edits the interpretation before
 * Research runs.
 */
@Injectable()
export class DiscoveryCheckpointService {
  private readonly logger = new Logger(DiscoveryCheckpointService.name);

  constructor(
    @InjectRepository(DiscoveryCheckpoint)
    private readonly checkpointRepo: Repository<DiscoveryCheckpoint>,
    @InjectRepository(ClarificationQuestion)
    private readonly questionRepo: Repository<ClarificationQuestion>,
  ) {}

  async upsert(projectId: string, data: DiscoveryCheckpointData): Promise<DiscoveryCheckpoint> {
    const existing = await this.checkpointRepo.findOne({ where: { projectId } });
    const blockingQuestionsJson = JSON.stringify(data.blockingQuestions ?? []);
    const entity = existing ?? this.checkpointRepo.create({ id: randomUUID(), projectId });
    entity.ideaInterpretation = data.ideaInterpretation;
    entity.problemStatement = data.problemStatement;
    entity.proposedSolution = data.proposedSolution;
    entity.initialScope = data.initialScope ?? null;
    entity.blockingQuestionsJson = blockingQuestionsJson;
    entity.status = 'PENDING';
    await this.checkpointRepo.save(entity);
    this.logger.log(`Discovery checkpoint stored for project ${projectId}`);
    return entity;
  }

  async getByProject(projectId: string): Promise<DiscoveryCheckpointView> {
    const checkpoint = await this.checkpointRepo.findOne({ where: { projectId } });
    if (!checkpoint) {
      throw new NotFoundException('No discovery checkpoint for this project');
    }

    const questions = await this.questionRepo.find({
      where: { projectId },
      order: { createdAt: 'ASC' },
    });
    const hasPendingBlocking = questions.some((q) => q.isBlocking && q.status === 'PENDING');

    return {
      id: checkpoint.id,
      projectId,
      ideaInterpretation: checkpoint.ideaInterpretation,
      problemStatement: checkpoint.problemStatement,
      proposedSolution: checkpoint.proposedSolution,
      initialScope: checkpoint.initialScope,
      status: checkpoint.status,
      blockingQuestions: (() => {
        try {
          return JSON.parse(
            checkpoint.blockingQuestionsJson ?? '[]',
          ) as DiscoveryCheckpointView['blockingQuestions'];
        } catch {
          this.logger.warn(
            `Malformed blockingQuestionsJson for project ${projectId} — falling back to empty array`,
          );
          return [];
        }
      })(),
      questions: questions.map((q) => ({
        id: q.id,
        question: q.question,
        context: q.context,
        isBlocking: q.isBlocking,
        status: q.status,
        answer: q.answer,
      })),
      canProceed: !hasPendingBlocking,
      createdAt: checkpoint.createdAt,
      updatedAt: checkpoint.updatedAt,
    };
  }

  /**
   * Confirms the (possibly edited) interpretation. Refuses to confirm while any
   * blocking question is still unanswered.
   */
  async confirm(
    projectId: string,
    edits: {
      ideaInterpretation?: string;
      problemStatement?: string;
      proposedSolution?: string;
      initialScope?: string;
    },
  ): Promise<DiscoveryCheckpointView> {
    const checkpoint = await this.checkpointRepo.findOne({ where: { projectId } });
    if (!checkpoint) {
      throw new NotFoundException('No discovery checkpoint for this project');
    }

    const pendingBlocking = await this.questionRepo.find({
      where: { projectId, isBlocking: true, status: 'PENDING' },
    });
    if (pendingBlocking.length > 0) {
      throw new BadRequestException(
        `Blocking questions must be answered before continuing: ${pendingBlocking.map((q) => q.question).join('; ')}`,
      );
    }

    checkpoint.ideaInterpretation =
      edits.ideaInterpretation?.trim() || checkpoint.ideaInterpretation;
    checkpoint.problemStatement = edits.problemStatement?.trim() || checkpoint.problemStatement;
    checkpoint.proposedSolution = edits.proposedSolution?.trim() || checkpoint.proposedSolution;
    checkpoint.initialScope = edits.initialScope?.trim() || checkpoint.initialScope;
    checkpoint.status = 'CONFIRMED';
    await this.checkpointRepo.save(checkpoint);

    this.logger.log(`Discovery checkpoint confirmed for project ${projectId}`);
    return this.getByProject(projectId);
  }

  async isConfirmed(projectId: string): Promise<boolean> {
    const checkpoint = await this.checkpointRepo.findOne({ where: { projectId } });
    return checkpoint?.status === 'CONFIRMED';
  }
}
