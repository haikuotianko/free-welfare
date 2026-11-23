import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { SessionGuard } from '../../common/session.guard';
import { parseInput } from '../../common/validate';
import { LogsService } from './logs.service';

const logQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().trim().max(500).optional(),
  account: z.string().trim().max(200).optional(),
  site: z.string().trim().max(200).optional(),
  status: z.string().trim().max(40).optional(),
  level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

@Controller('api/v1/logs')
@UseGuards(SessionGuard)
export class LogsController {
  constructor(private readonly logs: LogsService) {}

  @Get()
  list(@Query() query: Record<string, string | undefined>) {
    return this.logs.list(parseInput(logQuerySchema, query));
  }
}
