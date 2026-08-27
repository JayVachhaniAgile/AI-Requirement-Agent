import { Module } from '@nestjs/common';
import { CanonicalModelModule } from '../canonical/canonical-model.module';
import { QualityGateModule } from '../validation/quality-gate.module';
import { DocumentsModule } from '../documents/documents.module';
import { PipelineFoundationService } from './pipeline-foundation.service';

@Module({
  imports: [CanonicalModelModule, QualityGateModule, DocumentsModule],
  providers: [PipelineFoundationService],
  exports: [PipelineFoundationService],
})
export class IntegrationModule {}
