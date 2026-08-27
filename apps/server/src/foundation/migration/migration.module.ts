import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentComparison } from './agent-comparison.entity';
import { SkillModule } from '../skills/skill.module';
import { MigrationComparisonService } from './migration.service';
import { LegacyAgentAdapterService } from './legacy-agent.adapter';
import { MigrationController } from './migration.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AgentComparison]), SkillModule],
  controllers: [MigrationController],
  providers: [MigrationComparisonService, LegacyAgentAdapterService],
  exports: [LegacyAgentAdapterService, MigrationComparisonService],
})
export class MigrationModule {}
