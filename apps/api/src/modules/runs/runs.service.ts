import { Injectable } from '@nestjs/common';
import type { Prisma } from '@free-welfare/db';
import { z } from 'zod';
import { PrismaService } from '../../database/prisma.service';
import { AppError } from '../../common/app-error';
import { QueueService } from '../queue/queue.service';
import { runInclude } from './run-include';

export const runActionSchema = z.object({
  action: z.string().min(1).max(60),
  input: z.record(z.unknown()).optional(),
});

@Injectable()
export class RunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async list() {
    const [recent, active] = await Promise.all([
      this.prisma.client.run.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: runInclude,
      }),
      this.prisma.client.run.findMany({
        where: { status: { in: ['starting', 'queued', 'running'] } },
        orderBy: { createdAt: 'asc' },
        include: runInclude,
      }),
    ]);
    const byId = new Map([...active, ...recent].map((run) => [run.id, run]));
    return [...byId.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async get(id: string) {
    const run = await this.prisma.client.run.findUnique({
      where: { id },
      include: {
        task: {
          include: {
            binding: {
              include: {
                site: true,
                siteAccount: { include: { wechatAccount: true } },
                script: true,
              },
            },
          },
        },
        siteScript: true,
        site: true,
        siteAccount: { include: { wechatAccount: true } },
        logs: { orderBy: { ts: 'asc' } },
      },
    });
    if (!run) throw new AppError('run_not_found', '运行记录不存在', 404);
    return { ...run, queue: await this.queue.describe(run.id) };
  }

  async retry(id: string) {
    const run = await this.prisma.client.run.findUnique({ where: { id } });
    if (!run) throw new AppError('run_not_found', '运行记录不存在', 404);
    return this.queue.enqueue({
      taskId: run.taskId ?? undefined,
      siteScriptId: run.siteScriptId ?? undefined,
      siteId: run.siteId ?? undefined,
      siteAccountId: run.siteAccountId ?? undefined,
      scriptVersionId: run.scriptVersionId ?? undefined,
    });
  }

  async action(id: string, input: z.infer<typeof runActionSchema>) {
    const run = await this.prisma.client.run.findUnique({ where: { id } });
    if (!run) throw new AppError('run_not_found', '运行记录不存在', 404);
    if (!run.siteScriptId || !run.siteId || !run.siteAccountId) {
      throw new AppError('run_not_actionable', '这条运行记录不能执行操作', 400);
    }

    // 注册已独立成脚本时，优先运行应用的「注册」脚本，而不是重跑签到脚本。
    if (input.action === 'register') {
      const registerScript = await this.prisma.client.siteScript.findFirst({
        where: {
          siteId: run.siteId,
          enabled: true,
          OR: [{ capabilities: { has: 'register' } }, { filePath: 'register.js' }],
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (registerScript) {
        return this.queue.enqueue({
          siteScriptId: registerScript.id,
          siteId: run.siteId,
          siteAccountId: run.siteAccountId,
        });
      }
    }

    return this.queue.enqueue({
      siteScriptId: run.siteScriptId,
      siteId: run.siteId,
      siteAccountId: run.siteAccountId,
      input: {
        action: input.action,
        ...(input.input ?? {}),
      } as Prisma.InputJsonValue,
    });
  }
}
