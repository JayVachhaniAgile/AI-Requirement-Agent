import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project, KnowledgeItem } from '../../database/entities';
import { CanonicalItem } from '../canonical/canonical-item.entity';
import { ContextEngineService } from './context-engine.service';
import { ContextEngineController } from './context-engine.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Project, KnowledgeItem, CanonicalItem])],
  controllers: [ContextEngineController],
  providers: [ContextEngineService],
  exports: [ContextEngineService],
})
export class ContextEngineModule {}
