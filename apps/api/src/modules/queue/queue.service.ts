import { Injectable } from '@nestjs/common';
import type { Prisma } from '@free-welfare/db';
import {
  QUEUE_SETTING_KEY,
  normalizeQueueConfig,
  readQueueConfig,
  type QueueConfig,
} from '@free-welfare/domain';
import { PrismaService } from '../../database/prisma.service';
import { AppError } from '../../common/app-error';

const ACTIVE_STATUSES = ['starting', 'running'];

export interface EnqueueInput {
  taskId?: string;
  siteScriptId?: string;
  siteId?: string;
  siteAccountId?: string;
  scriptVersionId?: string;
  input?: Prisma.InputJsonValue;
  notBefore?: Date | null;
}

export interface QueueTicket {
  /** 排队序号；立刻开始时为 0。 */
  position: number;
  /** 前方还有多少个排队任务。 */
  ahead: number;
  running: number;
  starting: number;
  queued: number;
  concurrency: number;
  perAccountConcurrency: number;
  perSiteConcurrency: number;
  willStartImmediately: boolean;
  startsAt: string | null;
}

@Injectable()
export class QueueService {
  private lock: Promise<void> = Promise.resolve();

  constructor(private readonly prisma: PrismaService) {}

  async getConfig(): Promise<QueueConfig> {
    const row = await this.prisma.client.setting.findUnique({
      where: { key: QUEUE_SETTING_KEY },
    });
    return readQueueConfig(row?.value);
  }

  async updateConfig(input: Partial<QueueConfig>): Promise<QueueConfig> {
    const current = await this.getConfig();
    const config = normalizeQueueConfig({
      concurrency: input.concurrency ?? current.concurrency,
      perAccountConcurrency:
        input.perAccountConcurrency ?? current.perAccountConcurrency,
      perSiteConcurrency: input.perSiteConcurrency ?? current.perSiteConcurrency,
      runTimeoutMinutes: input.runTimeoutMinutes ?? current.runTimeoutMinutes,
      maxQueueSize: input.maxQueueSize ?? current.maxQueueSize,
      runMissedSchedules: input.runMissedSchedules ?? current.runMissedSchedules,
    });
    await this.prisma.client.setting.upsert({
      where: { key: QUEUE_SETTING_KEY },
      create: {
        key: QUEUE_SETTING_KEY,
        value: config as unknown as Prisma.InputJsonValue,
      },
      update: { value: config as unknown as Prisma.InputJsonValue },
    });
    return config;
  }

  async status() {
    const config = await this.getConfig();
    const [running, starting, queued, next] = await Promise.all([
      this.prisma.client.run.count({ where: { status: 'running' } }),
      this.prisma.client.run.count({ where: { status: 'starting' } }),
      this.prisma.client.run.count({ where: { status: 'queued' } }),
      this.prisma.client.run.findMany({
        where: { status: 'queued' },
        orderBy: { createdAt: 'asc' },
        take: 8,
        select: {
          id: true,
          createdAt: true,
          notBefore: true,
          site: { select: { name: true } },
          siteScript: { select: { name: true } },
          siteAccount: {
            select: { wechatAccount: { select: { displayName: true } } },
          },
          task: {
            select: {
              capability: true,
              binding: {
                select: {
                  site: { select: { name: true } },
                  siteAccount: {
                    select: { wechatAccount: { select: { displayName: true } } },
                  },
                },
              },
            },
          },
        },
      }),
    ]);
    return {
      config,
      active: { running, starting, queued },
      queue: next.map((run) => ({
        id: run.id,
        createdAt: run.createdAt,
        notBefore: run.notBefore,
        siteName:
          run.site?.name ?? run.task?.binding?.site?.name ?? '应用',
        scriptName:
          run.siteScript?.name ?? run.task?.capability ?? '任务',
        accountName:
          run.siteAccount?.wechatAccount?.displayName ??
          run.task?.binding?.siteAccount?.wechatAccount?.displayName ??
          '未知账号',
      })),
    };
  }

  /** 给运行详情返回实时的排队信息；非排队/启动状态返回 null。 */
  async describe(runId: string): Promise<QueueTicket | null> {
    const run = await this.prisma.client.run.findUnique({
      where: { id: runId },
      select: { status: true, createdAt: true, notBefore: true },
    });
    if (!run || (run.status !== 'queued' && run.status !== 'starting')) {
      return null;
    }
    const config = await this.getConfig();
    const [running, starting, queued, ahead] = await Promise.all([
      this.prisma.client.run.count({ where: { status: 'running' } }),
      this.prisma.client.run.count({ where: { status: 'starting' } }),
      this.prisma.client.run.count({ where: { status: 'queued' } }),
      this.prisma.client.run.count({
        where: { status: 'queued', createdAt: { lt: run.createdAt } },
      }),
    ]);
    const immediate = run.status === 'starting';
    return {
      position: immediate ? 0 : ahead + 1,
      ahead: immediate ? 0 : ahead,
      running,
      starting,
      queued,
      concurrency: config.concurrency,
      perAccountConcurrency: config.perAccountConcurrency,
      perSiteConcurrency: config.perSiteConcurrency,
      willStartImmediately: immediate,
      startsAt: immediate
        ? null
        : (run.notBefore?.toISOString() ?? null),
    };
  }

  /**
   * 所有运行记录的统一入口。
   * - 有容量且没有排队任务时直接进入 starting，由 worker 立即认领；
   * - 否则进入 queued，并返回排队序号、前方人数和预计开始时间。
   */
  enqueue(input: EnqueueInput) {
    return this.withLock(() => this.enqueueLocked(input));
  }

  private async enqueueLocked(input: EnqueueInput) {
    const config = await this.getConfig();
    const now = new Date();
    const [active, queued] = await Promise.all([
      this.prisma.client.run.findMany({
        where: { status: { in: ACTIVE_STATUSES } },
        select: { status: true, siteId: true, siteAccountId: true },
      }),
      this.prisma.client.run.findMany({
        where: { status: 'queued' },
        orderBy: { createdAt: 'asc' },
        select: { id: true, createdAt: true, notBefore: true },
      }),
    ]);

    const eligibleQueued = queued.filter(
      (run) => !run.notBefore || run.notBefore.getTime() <= now.getTime(),
    ).length;
    const activeForAccount = input.siteAccountId
      ? active.filter((run) => run.siteAccountId === input.siteAccountId).length
      : 0;
    const activeForSite = input.siteId
      ? active.filter((run) => run.siteId === input.siteId).length
      : 0;
    const requestedNotBefore = input.notBefore ?? null;
    const requestEligible =
      !requestedNotBefore || requestedNotBefore.getTime() <= now.getTime();

    const hasCapacity =
      active.length < config.concurrency &&
      activeForAccount < config.perAccountConcurrency &&
      (config.perSiteConcurrency === 0 ||
        !input.siteId ||
        activeForSite < config.perSiteConcurrency);
    const willStartImmediately =
      requestEligible && eligibleQueued === 0 && hasCapacity;

    if (
      !willStartImmediately &&
      config.maxQueueSize > 0 &&
      queued.length >= config.maxQueueSize
    ) {
      throw new AppError(
        'queue_full',
        `队列已满（上限 ${config.maxQueueSize}），请稍后再试`,
        429,
        {
          queued: queued.length,
          maxQueueSize: config.maxQueueSize,
          position: queued.length + 1,
        },
      );
    }

    const run = await this.prisma.client.run.create({
      data: {
        taskId: input.taskId,
        siteScriptId: input.siteScriptId,
        siteId: input.siteId,
        siteAccountId: input.siteAccountId,
        scriptVersionId: input.scriptVersionId,
        input: input.input,
        notBefore: requestedNotBefore ?? undefined,
        status: willStartImmediately ? 'starting' : 'queued',
      },
    });

    // 建好运行记录就先写一条日志，避免排队/启动阶段详情里一直是“暂无日志”。
    await this.prisma.client.runLog.create({
      data: {
        runId: run.id,
        level: 'info',
        message: willStartImmediately
          ? '已分配到执行槽位，等待 worker 启动'
          : `已加入执行队列，前方 ${queued.length} 个任务`,
      },
    });

    const running = active.filter((item) => item.status === 'running').length;
    const starting =
      active.filter((item) => item.status === 'starting').length +
      (willStartImmediately ? 1 : 0);
    const ticket: QueueTicket = {
      position: willStartImmediately ? 0 : queued.length + 1,
      ahead: willStartImmediately ? 0 : queued.length,
      running,
      starting,
      queued: willStartImmediately ? queued.length : queued.length + 1,
      concurrency: config.concurrency,
      perAccountConcurrency: config.perAccountConcurrency,
      perSiteConcurrency: config.perSiteConcurrency,
      willStartImmediately,
      startsAt: willStartImmediately
        ? now.toISOString()
        : (requestedNotBefore?.toISOString() ?? null),
    };
    return { ...run, queue: ticket };
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    let release: () => void = () => undefined;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.lock;
    this.lock = previous.then(() => next);
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}
