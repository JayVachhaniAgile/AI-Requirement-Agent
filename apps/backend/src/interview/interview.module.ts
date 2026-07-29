import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LlmModule } from '../llm/llm.module';
import { ProjectsModule } from '../projects/projects.module';
import { InterviewController } from './interview.controller';
import { InterviewService } from './interview.service';
import { InterviewSessionEntity } from '../database/entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([InterviewSessionEntity]),
    LlmModule,
    ProjectsModule,
  ],
  controllers: [InterviewController],
  providers: [InterviewService],
})
export class InterviewModule {}
