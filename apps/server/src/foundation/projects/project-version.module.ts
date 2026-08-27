import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project, ProjectVersion } from '../../database/entities';
import { ProjectVersionService } from './project-version.service';
import { ProjectVersionController } from './project-version.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Project, ProjectVersion])],
  controllers: [ProjectVersionController],
  providers: [ProjectVersionService],
  exports: [ProjectVersionService],
})
export class ProjectVersionModule {}
