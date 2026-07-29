import { Controller, Get, Put, Body } from '@nestjs/common';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('pipeline')
  getPipelineDefaults() {
    return this.settings.getPipelineDefaults();
  }

  @Put('pipeline')
  setPipelineDefaults(@Body() body: Record<string, string>) {
    return this.settings.setPipelineDefaults(body);
  }
}
