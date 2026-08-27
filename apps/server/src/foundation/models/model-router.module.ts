import { Module } from '@nestjs/common';
import { ModelRouterService } from './model-router.service';
import { ModelRouterController } from './model-router.controller';

@Module({
  controllers: [ModelRouterController],
  providers: [ModelRouterService],
  exports: [ModelRouterService],
})
export class ModelRouterModule {}
