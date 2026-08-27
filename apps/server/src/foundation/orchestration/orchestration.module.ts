import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrchestrationPlanEntity } from './orchestration-plan.entity';
import { OrchestrationNodeEntity } from './orchestration-node.entity';
import { SkillModule } from '../skills/skill.module';
import { QualityGateModule } from '../validation/quality-gate.module';
import { ArtifactsModule } from '../artifacts/artifacts.module';
import { OrchestrationService } from './orchestration.service';
import { OrchestrationController } from './orchestration.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrchestrationPlanEntity, OrchestrationNodeEntity]),
    SkillModule,
    QualityGateModule,
    ArtifactsModule,
  ],
  controllers: [OrchestrationController],
  providers: [OrchestrationService],
  exports: [OrchestrationService],
})
export class OrchestrationModule {}
