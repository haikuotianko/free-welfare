import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { QueueService } from './queue.service';
import { parseInput } from '../../common/validate';
import { SessionGuard } from '../../common/session.guard';

const queueConfigSchema = z.object({
  concurrency: z.number().int().min(1).max(20).optional(),
  perAccountConcurrency: z.number().int().min(1).max(10).optional(),
  perSiteConcurrency: z.number().int().min(0).max(10).optional(),
  runTimeoutMinutes: z.number().int().min(1).max(1440).optional(),
  maxQueueSize: z.number().int().min(0).max(1000).optional(),
  runMissedSchedules: z.boolean().optional(),
});

@Controller('api/v1/queue')
@UseGuards(SessionGuard)
export class QueueController {
  constructor(private readonly queue: QueueService) {}

  @Get()
  status() {
    return this.queue.status();
  }

  @Patch('config')
  updateConfig(@Body() body: unknown) {
    return this.queue.updateConfig(parseInput(queueConfigSchema, body));
  }
}
