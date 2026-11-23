import { Injectable } from '@nestjs/common';
import type { Prisma } from '@free-welfare/db';
import { PrismaService } from '../../database/prisma.service';
import { runInclude } from '../runs/run-include';

export interface LogListInput {
  page: number;
  pageSize: number;
  q?: string;
  account?: string;
  site?: string;
  status?: string;
  level?: string;
  from?: Date;
  to?: Date;
}

@Injectable()
export class LogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(input: LogListInput) {
    const and: Prisma.RunLogWhereInput[] = [];

    if (input.level) and.push({ level: input.level });
    if (input.status) and.push({ run: { status: input.status } });
    if (input.q) {
      and.push({
        OR: [
          { message: { contains: input.q, mode: 'insensitive' } },
          { run: { errorMessage: { contains: input.q, mode: 'insensitive' } } },
        ],
      });
    }
    if (input.from || input.to) {
      const ts: Prisma.DateTimeFilter = {};
      if (input.from) ts.gte = input.from;
      if (input.to) ts.lte = input.to;
      and.push({ ts });
    }

    if (input.account) {
      const accounts = await this.prisma.client.wechatAccount.findMany({
        where: {
          OR: [
            { id: { contains: input.account, mode: 'insensitive' } },
            { displayName: { contains: input.account, mode: 'insensitive' } },
            { yybRef: { contains: input.account, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });
      if (accounts.length === 0) return this.empty(input.page, input.pageSize);
      const siteAccounts = await this.prisma.client.siteAccount.findMany({
        where: { wechatAccountId: { in: accounts.map((account) => account.id) } },
        select: { id: true },
      });
      if (siteAccounts.length === 0) return this.empty(input.page, input.pageSize);
      const ids = siteAccounts.map((account) => account.id);
      and.push({
        OR: [
          { run: { siteAccountId: { in: ids } } },
          { run: { task: { binding: { siteAccountId: { in: ids } } } } },
        ],
      });
    }

    if (input.site) {
      const sites = await this.prisma.client.site.findMany({
        where: {
          OR: [
            { id: { contains: input.site, mode: 'insensitive' } },
            { key: { contains: input.site, mode: 'insensitive' } },
            { name: { contains: input.site, mode: 'insensitive' } },
            { appId: { contains: input.site, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });
      if (sites.length === 0) return this.empty(input.page, input.pageSize);
      const ids = sites.map((site) => site.id);
      and.push({
        OR: [
          { run: { siteId: { in: ids } } },
          { run: { task: { binding: { siteId: { in: ids } } } } },
        ],
      });
    }

    const where: Prisma.RunLogWhereInput = and.length > 0 ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.client.runLog.findMany({
        where,
        orderBy: { ts: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: { run: { include: runInclude } },
      }),
      this.prisma.client.runLog.count({ where }),
    ]);

    return {
      items: rows.map((row) => {
        const run = row.run;
        const binding = run.task?.binding ?? null;
        const site = run.site ?? binding?.site ?? null;
        const siteAccount = run.siteAccount ?? binding?.siteAccount ?? null;
        const account = siteAccount?.wechatAccount ?? null;
        return {
          id: row.id,
          ts: row.ts.toISOString(),
          level: row.level,
          message: row.message,
          data: row.data,
          runId: run.id,
          runStatus: run.status,
          runCreatedAt: run.createdAt.toISOString(),
          runStartedAt: run.startedAt?.toISOString() ?? null,
          runFinishedAt: run.finishedAt?.toISOString() ?? null,
          durationMs: run.durationMs,
          errorCode: run.errorCode,
          errorMessage: run.errorMessage,
          siteId: site?.id ?? null,
          siteName: site?.name ?? '—',
          siteKey: site?.key ?? '',
          siteAccountId: siteAccount?.id ?? null,
          accountId: account?.id ?? null,
          accountName: account?.displayName ?? '—',
          scriptName: run.siteScript?.name ?? binding?.script?.name ?? run.task?.capability ?? '—',
        };
      }),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  private empty(page: number, pageSize: number) {
    return { items: [], total: 0, page, pageSize };
  }
}
