import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeItem } from '../../database/entities';
import { ProjectKnowledgeService } from './project-knowledge.service';
import { ProjectKnowledgeController } from './project-knowledge.controller';

@Module({
  imports: [TypeOrmModule.forFeature([KnowledgeItem])],
  controllers: [ProjectKnowledgeController],
  providers: [ProjectKnowledgeService],
  exports: [ProjectKnowledgeService],
})
export class ProjectKnowledgeModule {}
