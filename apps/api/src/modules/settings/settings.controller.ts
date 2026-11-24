import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { SettingsService } from './settings.service';
import { parseInput } from '../../common/validate';
import { SessionGuard } from '../../common/session.guard';

const settingsUpdateSchema = z.object({
  yybBaseUrl: z.string().url().optional(),
  yybIntegrationToken: z.string().min(1).optional(),
  yybProtocolToken: z.string().min(1).optional(),
  scriptSourceUrl: z.string().url().optional(),
  serverchanToken: z.string().min(1).optional(),
  onboardingCompleted: z.boolean().optional(),
});

@Controller('api/v1/settings')
@UseGuards(SessionGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get() {
    return this.settings.getPublic();
  }

  @Patch()
  update(@Body() body: unknown) {
    return this.settings.update(parseInput(settingsUpdateSchema, body));
  }
}
