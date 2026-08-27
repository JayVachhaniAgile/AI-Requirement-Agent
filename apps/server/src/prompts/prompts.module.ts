import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PromptTemplate,
  PromptVersion,
  PromptTestRun,
} from '../database/entities';
import { PromptsController } from './prompts.controller';
import { PromptsService } from './prompts.service';

@Module({
  imports: [TypeOrmModule.forFeature([PromptTemplate, PromptVersion, PromptTestRun])],
  controllers: [PromptsController],
  providers: [PromptsService],
  exports: [PromptsService],
})
export class PromptsModule {}
