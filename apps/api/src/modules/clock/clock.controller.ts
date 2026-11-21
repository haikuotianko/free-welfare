import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ClockService } from './clock.service';
import { SessionGuard } from '../../common/session.guard';
import { parseInput } from '../../common/validate';

const clockUpdateSchema = z.object({
  mode: z.enum(['auto', 'manual']).optional(),
  sourceUrl: z.string().max(500).optional(),
  syncIntervalSeconds: z.number().int().min(30).max(86_400).optional(),
  manualTime: z.string().min(1).max(80).optional(),
});

@Controller('api/v1/clock')
@UseGuards(SessionGuard)
export class ClockController {
  constructor(private readonly clock: ClockService) {}

  @Get()
  get() {
    return this.clock.getPublic();
  }

  @Patch()
  update(@Body() body: unknown) {
    return this.clock.update(parseInput(clockUpdateSchema, body));
  }

  @Post('sync')
  sync() {
    return this.clock.syncNow();
  }
}
