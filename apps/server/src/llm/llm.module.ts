import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { ModelRouterModule } from '../foundation/models/model-router.module';

@Module({
  imports: [ModelRouterModule],
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}
