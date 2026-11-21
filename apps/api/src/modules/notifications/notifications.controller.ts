import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { NotificationsService } from './notifications.service';
import { SessionGuard } from '../../common/session.guard';
import { parseInput } from '../../common/validate';

const testSchema = z.object({
  title: z.string().min(1).max(100).default('Free Welfare 测试'),
  body: z.string().max(1000).default('这是一条测试通知'),
});

@Controller('api/v1/notifications')
@UseGuards(SessionGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list() {
    return this.notifications.list();
  }

  @Post('test')
  test(@Body() body: unknown) {
    const input = parseInput(testSchema, body ?? {});
    return this.notifications.test(input.title, input.body);
  }
}
