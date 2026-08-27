import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  Artifact,
  KnowledgeItem,
  QualityCheck,
} from '../../database/entities';
import {
  evaluateArtifactPresence,
  evaluateCoverage,
  evaluateIdIntegrity,
  QUALITY_GATES,
  type CoverageResult,
  type IdIntegrityResult,
  type ArtifactPresenceResult,
  type QualitySeverity,
} from './quality-gates.config';
import { QUALITY_CHECK_STATUS } from '../common/foundation-status';

export interface RunQualityGatesInput {
  projectId: string;
  workflowExecutionId?: string;
  /** Knowledge coverage floor. */
  minKnowledgeItems?: number;
  /** Required types for `knowledge-coverage`. */
  requiredKnowledgeTypes?: string[];
  /** Required types for `artifact-presence`. */
  requiredArtifactTypes?: string[];
}

export interface QualityGateReport {
  projectId: string;
  workflowExecutionId: string | null;
  ran: string[];
  passed: string[];
  failed: string[];
  checks: QualityCheck[];
  pass: boolean;
}

/**
 * Quality Gate runner (new architecture).
 *
 * Persists one `quality_check` row per gate run and aggregates a pass/fail
 * verdict for the workflow engine. Built-in gates are registered in
 * `quality-gates.config.ts`; additional gates can be plugged in by extending
 * the runner without touching the existing validation module.
 */
@Injectable()
export class QualityGateService {
  private readonly logger = new Logger(QualityGateService.name);

  constructor(
    @InjectRepository(QualityCheck)
    private readonly checkRepo: Repository<QualityCheck>,
    @InjectRepository(KnowledgeItem)
    private readonly kiRepo: Repository<KnowledgeItem>,
    @InjectRepository(Artifact)
    private readonly artifactRepo: Repository<Artifact>,
  ) {}

  listGates() {
    return Object.values(QUALITY_GATES);
  }

  async run(input: RunQualityGatesInput): Promise<QualityGateReport> {
    const checks: QualityCheck[] = [];
    const passed: string[] = [];
    const failed: string[] = [];

    const knowledge: KnowledgeItem[] = await this.kiRepo.find({
      where: { projectId: input.projectId },
    });
    const artifacts: Artifact[] = await this.artifactRepo.find({
      where: { projectId: input.projectId },
    });

    // Gate: knowledge-coverage (advisory — recorded but not blocking).
    const coverage = evaluateCoverage(knowledge, {
      minItems: input.minKnowledgeItems ?? 5,
      requiredTypes: input.requiredKnowledgeTypes,
    });
    const coverageRow = await this.persistCheck(
      input,
      coverage,
      QUALITY_GATES['knowledge-coverage'].defaultSeverity,
    );
    checks.push(coverageRow);
    if (
      coverageRow.status === QUALITY_CHECK_STATUS.PASS ||
      QUALITY_GATES['knowledge-coverage'].advisory
    ) {
      passed.push(coverageRow.gateKey);
    } else {
      failed.push(coverageRow.gateKey);
    }

    // Gate: id-integrity (blocking).
    const idIntegrity = evaluateIdIntegrity(knowledge);
    const idRow = await this.persistCheck(
      input,
      idIntegrity,
      QUALITY_GATES['id-integrity'].defaultSeverity,
    );
    checks.push(idRow);
    if (idRow.status === QUALITY_CHECK_STATUS.PASS) {
      passed.push(idRow.gateKey);
    } else {
      failed.push(idRow.gateKey);
    }

    // Gate: artifact-presence (only when required types are declared).
    if (input.requiredArtifactTypes && input.requiredArtifactTypes.length > 0) {
      const presence = evaluateArtifactPresence(
        artifacts.map((a) => a.type),
        input.requiredArtifactTypes,
      );
      const presenceRow = await this.persistCheck(
        input,
        presence,
        QUALITY_GATES['artifact-presence'].defaultSeverity,
      );
      checks.push(presenceRow);
      if (presenceRow.status === QUALITY_CHECK_STATUS.PASS) {
        passed.push(presenceRow.gateKey);
      } else {
        failed.push(presenceRow.gateKey);
      }
    }

    return {
      projectId: input.projectId,
      workflowExecutionId: input.workflowExecutionId ?? null,
      ran: checks.map((c) => c.gateKey),
      passed,
      failed,
      checks,
      pass: failed.length === 0,
    };
  }

  async listForProject(projectId: string): Promise<QualityCheck[]> {
    return this.checkRepo.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
    });
  }

  private async persistCheck(
    input: RunQualityGatesInput,
    result: CoverageResult | IdIntegrityResult | ArtifactPresenceResult,
    defaultSeverity: QualitySeverity,
  ): Promise<QualityCheck> {
    const row = this.checkRepo.create({
      id: randomUUID(),
      projectId: input.projectId,
      workflowExecutionId: input.workflowExecutionId ?? null,
      artifactId: null,
      gateKey: result.gateKey,
      status:
        result.status === 'PASS'
          ? QUALITY_CHECK_STATUS.PASS
          : QUALITY_CHECK_STATUS.FAIL,
      severity: defaultSeverity,
      score: result.score,
      findings: JSON.stringify(result.findings),
      checkedAt: new Date(),
    });
    return this.checkRepo.save(row);
  }
}
