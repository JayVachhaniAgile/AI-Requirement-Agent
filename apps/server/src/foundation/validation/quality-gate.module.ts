import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Artifact,
  KnowledgeItem,
  QualityCheck,
} from '../../database/entities';
import { CanonicalItem } from '../canonical/canonical-item.entity';
import { QualityGateService } from './quality-gate.service';
import { QualityEngineService } from './quality-engine.service';
import { QualityGateController } from './quality-gate.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([QualityCheck, KnowledgeItem, Artifact, CanonicalItem]),
  ],
  controllers: [QualityGateController],
  providers: [QualityGateService, QualityEngineService],
  exports: [QualityGateService, QualityEngineService],
})
export class QualityGateModule {}
