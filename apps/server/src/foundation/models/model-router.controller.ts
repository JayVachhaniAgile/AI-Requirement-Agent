import { Body, Controller, Post } from '@nestjs/common';
import { ModelRouterService } from './model-router.service';

@Controller('foundation/models')
export class ModelRouterController {
  constructor(private readonly router: ModelRouterService) {}

  @Post('route')
  route(
    @Body()
    body: {
      skillKey?: string;
      provider?: string;
      largeOutput?: boolean;
      maxTokens?: number;
    },
  ) {
    return this.router.route(body);
  }
}
