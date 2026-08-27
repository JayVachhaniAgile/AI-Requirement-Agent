import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CanonicalItem } from '../canonical/canonical-item.entity';
import { KnowledgeItem } from '../../database/entities';
import { RkbModule } from '../../rkb/rkb.module';
import { LlmModule } from '../../llm/llm.module';
import { ArtifactsModule } from '../artifacts/artifacts.module';
import { ArtifactCompilerService } from './artifact-compiler.service';
import { DocumentGeneratorService } from './document-generator.service';
import { CompilerController } from './compiler.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([CanonicalItem, KnowledgeItem]),
    RkbModule,
    LlmModule,
    ArtifactsModule,
  ],
  controllers: [CompilerController],
  providers: [ArtifactCompilerService, DocumentGeneratorService],
  exports: [ArtifactCompilerService, DocumentGeneratorService],
})
export class DocumentsModule {}
