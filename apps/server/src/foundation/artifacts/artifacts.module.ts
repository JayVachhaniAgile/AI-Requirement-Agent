import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Artifact,
  ArtifactVersion,
  ArtifactDependency,
} from '../../database/entities';
import { ArtifactRegistryService } from './artifact-registry.service';
import { ArtifactsController } from './artifacts.controller';
import { ArtifactDependencyService } from './artifact-dependency.service';
import { ImpactAnalysisService } from './impact-analysis.service';
import { ArtifactDependencyController } from './artifact-dependency.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Artifact, ArtifactVersion, ArtifactDependency]),
  ],
  controllers: [ArtifactsController, ArtifactDependencyController],
  providers: [ArtifactRegistryService, ArtifactDependencyService, ImpactAnalysisService],
  exports: [ArtifactRegistryService, ArtifactDependencyService, ImpactAnalysisService],
})
export class ArtifactsModule {}
