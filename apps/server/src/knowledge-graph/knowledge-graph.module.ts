import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  KnowledgeEdge,
  KnowledgeEmbedding,
  ProjectContextItem,
} from '../database/entities';
import { KnowledgeGraphController } from './knowledge-graph.controller';
import { KnowledgeGraphService } from './knowledge-graph.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([KnowledgeEdge, KnowledgeEmbedding, ProjectContextItem]),
  ],
  controllers: [KnowledgeGraphController],
  providers: [KnowledgeGraphService],
  exports: [KnowledgeGraphService],
})
export class KnowledgeGraphModule {}
