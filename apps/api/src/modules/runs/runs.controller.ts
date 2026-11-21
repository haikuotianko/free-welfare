import { Body, Controller, Get, Param, Post, Sse, UseGuards, type MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { runActionSchema, RunsService } from './runs.service';
import { RunEventsService } from './run-events.service';
import { SessionGuard } from '../../common/session.guard';
import { parseInput } from '../../common/validate';

@Controller('api/v1/runs')
@UseGuards(SessionGuard)
export class RunsController {
  constructor(
    private readonly runs: RunsService,
    private readonly events: RunEventsService,
  ) {}

  @Get()
  list() {
    return this.runs.list();
  }

  @Sse('stream')
  stream(): Observable<MessageEvent> {
    return this.events.stream();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.runs.get(id);
  }

  @Post(':id/retry')
  retry(@Param('id') id: string) {
    return this.runs.retry(id);
  }

  @Post(':id/action')
  action(@Param('id') id: string, @Body() body: unknown) {
    return this.runs.action(id, parseInput(runActionSchema, body));
  }
}
