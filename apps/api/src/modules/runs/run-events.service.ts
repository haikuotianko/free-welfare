import { Injectable, type MessageEvent, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { interval, merge, of, type Observable, Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import { PrismaService } from '../../database/prisma.service';
import { runInclude } from './run-include';

type RunStreamPayload =
  | { type: 'run'; data: unknown }
  | { type: 'log'; data: unknown }
  | { type: 'ping'; data: unknown };

/**
 * 运行事件流：
 * - 服务端每 500ms 查询一次新增/变更的运行和日志，推送给所有 SSE 客户端；
 * - 客户端只建一条 /api/v1/runs/stream 连接，列表和日志共用；
 * - 心跳 15 秒，避免代理断开空闲连接。
 */
@Injectable()
export class RunEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly subject = new Subject<RunStreamPayload>();
  private timer: NodeJS.Timeout | null = null;
  private pollInFlight = false;
  private lastRunAt = new Date();
  private lastLogAt = new Date();

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.poll();
    }, 500);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.subject.complete();
  }

  stream(): Observable<MessageEvent> {
    // 没有客户端时不需要回放历史；新连接先拉 REST 初始数据，再接收增量。
    // 每次（重）连接都先发 sync，让客户端重新拉一次列表和当前详情，
    // 避免断线期间的事件永久丢失导致详情停在“启动中”。
    if (!this.subject.observed) {
      this.lastRunAt = new Date();
      this.lastLogAt = new Date();
    }
    const events = this.subject.asObservable().pipe(
      map((event) => ({
        type: event.type,
        data: JSON.stringify(event.data),
      })),
    );
    const sync = of({
      type: 'sync',
      data: JSON.stringify({ at: new Date().toISOString() }),
    });
    const heartbeat = interval(15_000).pipe(
      map(() => ({
        type: 'ping',
        data: JSON.stringify({ at: new Date().toISOString() }),
      })),
    );
    return merge(sync, events, heartbeat);
  }

  private async poll(): Promise<void> {
    if (this.pollInFlight || !this.subject.observed) return;
    this.pollInFlight = true;
    const checkAt = new Date();
    try {
      const [runs, logs] = await Promise.all([
        this.prisma.client.run.findMany({
          where: { updatedAt: { gt: this.lastRunAt, lte: checkAt } },
          orderBy: { updatedAt: 'asc' },
          include: runInclude,
        }),
        this.prisma.client.runLog.findMany({
          where: { ts: { gt: this.lastLogAt, lte: checkAt } },
          orderBy: { ts: 'asc' },
          take: 1000,
        }),
      ]);

      const timeline = [
        ...logs.map((log) => ({
          at: log.ts.getTime(),
          event: { type: 'log' as const, data: log },
        })),
        ...runs.map((run) => ({
          at: run.updatedAt.getTime(),
          event: { type: 'run' as const, data: run },
        })),
      ].sort((a, b) => a.at - b.at);
      for (const item of timeline) {
        this.subject.next(item.event);
      }

      this.lastRunAt = checkAt;
      // 日志一次最多拉 1000 条；如果达到上限，下次从最后一条继续，避免丢日志。
      this.lastLogAt =
        logs.length >= 1000 ? new Date(logs[logs.length - 1].ts.getTime() - 1) : checkAt;
    } catch (error) {
      console.error('run events poll failed', error);
    } finally {
      this.pollInFlight = false;
    }
  }
}
