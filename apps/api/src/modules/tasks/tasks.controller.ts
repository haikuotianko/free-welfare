import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { taskCreateSchema } from '@free-welfare/shared';
import { TasksService } from './tasks.service';
import { SessionGuard } from '../../common/session.guard';
import { parseInput } from '../../common/validate';

@Controller('api/v1/tasks')
@UseGuards(SessionGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list() {
    return this.tasks.list();
  }

  @Post()
  create(@Body() body: unknown) {
    return this.tasks.create(parseInput(taskCreateSchema, body));
  }

  @Post(':id/run')
  run(@Param('id') id: string) {
    return this.tasks.run(id);
  }
}
