import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Document, Project } from '../database/entities';
import { DagEngineModule } from '../dag-engine/dag-engine.module';
import { ArtifactsController } from './artifacts.controller';
import { ArtifactsService } from './artifacts.service';

@Module({
  imports: [TypeOrmModule.forFeature([Document, Project]), DagEngineModule],
  controllers: [ArtifactsController],
  providers: [ArtifactsService],
  exports: [ArtifactsService],
})
export class ArtifactsModule {}
