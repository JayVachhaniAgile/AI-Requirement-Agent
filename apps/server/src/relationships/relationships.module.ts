import { Module } from '@nestjs/common';
import { KnowledgeGraphModule } from '../knowledge-graph/knowledge-graph.module';
import { RelationshipsController } from './relationships.controller';

@Module({
  imports: [KnowledgeGraphModule],
  controllers: [RelationshipsController],
})
export class RelationshipsModule {}
