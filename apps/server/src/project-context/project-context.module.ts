import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  KnowledgeItem,
  ProjectContextCommit,
  ProjectContextItem,
  ProjectContextSnapshot,
} from '../database/entities';
import { ProjectContextController } from './project-context.controller';
import { ProjectContextEventsService } from './project-context-events.service';
import { ProjectContextService } from './project-context.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProjectContextItem,
      ProjectContextSnapshot,
      ProjectContextCommit,
      KnowledgeItem,
    ]),
  ],
  controllers: [ProjectContextController],
  providers: [ProjectContextService, ProjectContextEventsService],
  exports: [ProjectContextService, ProjectContextEventsService],
})
export class ProjectContextModule {}
