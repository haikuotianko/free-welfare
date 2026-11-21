import { Injectable } from '@nestjs/common';
import type { TaskCreateInput } from '@free-welfare/shared';
import { DEFAULT_TIMEZONE } from '@free-welfare/shared';
import { PrismaService } from '../../database/prisma.service';
import { AppError } from '../../common/app-error';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  list() {
    return this.prisma.client.task.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        binding: { include: { site: true, siteAccount: true, script: true } },
      },
    });
  }

  async create(input: TaskCreateInput) {
    const binding = await this.prisma.client.binding.findUnique({
      where: { id: input.bindingId },
      include: { script: true },
    });
    if (!binding) throw new AppError('not_found', '绑定不存在', 404);
    if (binding.script.capability && binding.script.capability !== input.capability) {
      throw new AppError('task_invalid', '能力与脚本不匹配', 400);
    }
    return this.prisma.client.task.create({
      data: {
        bindingId: input.bindingId,
        capability: input.capability,
        cron: input.cron,
        timezone: input.timezone || DEFAULT_TIMEZONE,
        timeoutSeconds: input.timeoutSeconds,
        maxAttempts: input.maxAttempts,
        enabled: input.enabled,
      },
    });
  }

  async run(id: string) {
    const task = await this.prisma.client.task.findUnique({
      where: { id },
      include: { binding: { include: { script: true } } },
    });
    if (!task) throw new AppError('not_found', '任务不存在', 404);
    const run = await this.queue.enqueue({
      taskId: task.id,
      siteId: task.binding.siteId,
      siteAccountId: task.binding.siteAccountId,
      scriptVersionId: task.binding.script.currentVersionId ?? undefined,
    });
    await this.prisma.client.task.update({
      where: { id: task.id },
      data: { lastRunAt: new Date() },
    });
    return run;
  }
}
