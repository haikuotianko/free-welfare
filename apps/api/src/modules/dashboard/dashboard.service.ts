import { Injectable } from '@nestjs/common';
import { DEFAULT_TIMEZONE } from '@free-welfare/shared';
import { PrismaService } from '../../database/prisma.service';

function localDayRange(now = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: DEFAULT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [year, month, date] = day.split('-').map(Number);
  const start = new Date(year, month - 1, date);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { day, start, end };
}

function safeSiteAccount(siteAccount: any) {
  if (!siteAccount) return null;
  return {
    id: siteAccount.id,
    nickname: siteAccount.nickname ?? null,
    businessUserId: siteAccount.businessUserId ?? null,
    status: siteAccount.status,
    wechatAccount: siteAccount.wechatAccount
      ? {
          id: siteAccount.wechatAccount.id,
          displayName: siteAccount.wechatAccount.displayName,
          yybRef: siteAccount.wechatAccount.yybRef,
          status: siteAccount.wechatAccount.status,
          openidMasked: siteAccount.wechatAccount.openidMasked ?? null,
          avatarUrl: siteAccount.wechatAccount.avatarUrl ?? null,
        }
      : null,
  };
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(accountId?: string) {
    const { day, start, end } = localDayRange();
    const siteAccountIds = accountId
      ? (
          await this.prisma.client.siteAccount.findMany({
            where: { wechatAccountId: accountId },
            select: { id: true },
          })
        ).map((row) => row.id)
      : null;

    const runWhere = accountId
      ? {
          OR: [
            { siteAccountId: { in: siteAccountIds ?? [] } },
            {
              task: {
                binding: {
                  siteAccount: { wechatAccountId: accountId },
                },
              },
            },
          ],
        }
      : {};

    const accountRows = await this.prisma.client.wechatAccount.findMany({
      select: { status: true },
    });
    const [sites, installedScripts, appScripts, sources, runsTotal, runsToday, runsQueued, runsStarting, runsRunning, recentRuns, yybStats] =
      await Promise.all([
        this.prisma.client.site.count(),
        this.prisma.client.script.count(),
        this.prisma.client.siteScript.count({
          where: accountId
            ? { site: { siteAccounts: { some: { wechatAccountId: accountId } } } }
            : undefined,
        }),
        this.prisma.client.scriptSource.count(),
        this.prisma.client.run.count({ where: runWhere }),
        this.prisma.client.run.findMany({
          where: { AND: [runWhere, { createdAt: { gte: start, lt: end } }] },
          select: { status: true },
        }),
        this.prisma.client.run.count({ where: { ...runWhere, status: 'queued' } }),
        this.prisma.client.run.count({ where: { ...runWhere, status: 'starting' } }),
        this.prisma.client.run.count({ where: { ...runWhere, status: 'running' } }),
        this.prisma.client.run.findMany({
          where: runWhere,
          orderBy: { createdAt: 'desc' },
          take: 6,
          include: {
            siteScript: true,
            site: true,
            siteAccount: { include: { wechatAccount: true } },
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
          },
        }),
        this.prisma.client.yybRequestLog.groupBy({
          by: ['status'],
          where: {
            createdAt: { gte: start, lt: end },
            ...(accountId ? { wechatAccountId: accountId } : {}),
          },
          _count: { _all: true },
        }),
      ]);

    const pointWhere = accountId ? { siteAccountId: { in: siteAccountIds ?? [] } } : {};
    const [pointAccounts, products, grab, activitiesTotal, activitiesDone, orderAgg, orderSuccess, orderFailed, notifications, notificationFailed, recentNotifications, schedules] =
      await Promise.all([
        this.prisma.client.pointAccount.findMany({
          where: pointWhere,
          select: {
            balance: true,
            expiringAmount: true,
            nextExpiryAt: true,
            siteAccount: { select: { site: { select: { pointsName: true } } } },
          },
        }),
        this.prisma.client.product.findMany({
          where: { kind: 'product' },
          select: { status: true, stock: true },
        }),
        this.prisma.client.product.findMany({
          where: { kind: 'grab' },
          select: { status: true, stock: true },
        }),
        this.prisma.client.activity.count(),
        this.prisma.client.activity.count({ where: { status: 'completed' } }),
        this.prisma.client.order.count({
          where: accountId ? { siteAccountId: { in: siteAccountIds ?? [] } } : undefined,
        }),
        this.prisma.client.order.count({
          where: {
            status: 'success',
            ...(accountId ? { siteAccountId: { in: siteAccountIds ?? [] } } : {}),
          },
        }),
        this.prisma.client.order.count({
          where: {
            status: 'failed',
            ...(accountId ? { siteAccountId: { in: siteAccountIds ?? [] } } : {}),
          },
        }),
        this.prisma.client.notification.count(),
        this.prisma.client.notification.count({ where: { status: 'failed' } }),
        this.prisma.client.notification.findMany({
          orderBy: { createdAt: 'desc' },
          take: 3,
        }),
        this.prisma.client.siteScript.findMany({
          where: { enabled: true, cron: { not: '' }, nextRunAt: { not: null } },
          orderBy: { nextRunAt: 'asc' },
          take: 5,
          include: { site: { select: { id: true, key: true, name: true } } },
        }),
      ]);

    const todaySucceeded = runsToday.filter((run) => run.status === 'succeeded').length;
    const todayFailed = runsToday.filter((run) => run.status === 'failed' || run.status === 'timeout').length;
    const finished = todaySucceeded + todayFailed;
    const yybSuccess = yybStats.find((row) => row.status === 'success')?._count._all ?? 0;
    const yybFailed = yybStats.find((row) => row.status === 'failed')?._count._all ?? 0;

    const statusCount = (status: string) => accountRows.filter((row) => row.status === status).length;

    const pointGroups = new Map<string, { name: string; total: number; expiring: number; accounts: number }>();
    let pointsTotal = 0;
    let pointsExpiring = 0;
    let nextExpiryAt: Date | null = null;
    for (const account of pointAccounts) {
      const name = account.siteAccount?.site?.pointsName || '积分';
      const group = pointGroups.get(name) ?? { name, total: 0, expiring: 0, accounts: 0 };
      group.total += account.balance;
      group.expiring += account.expiringAmount;
      group.accounts += 1;
      pointGroups.set(name, group);
      pointsTotal += account.balance;
      pointsExpiring += account.expiringAmount;
      if (account.nextExpiryAt && (!nextExpiryAt || account.nextExpiryAt < nextExpiryAt)) {
        nextExpiryAt = account.nextExpiryAt;
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      day,
      filter: { accountId: accountId ?? null },
      accounts: {
        total: accountRows.length,
        alive: statusCount('alive'),
        sessionOnly: statusCount('session_only'),
        expired: statusCount('expired'),
      },
      sites,
      scripts: {
        installed: installedScripts,
        app: appScripts,
        sources,
      },
      runs: {
        total: runsTotal,
        today: runsToday.length,
        todaySucceeded,
        todayFailed,
        queued: runsQueued,
        starting: runsStarting,
        running: runsRunning + runsStarting,
        successRate: finished ? Math.round((todaySucceeded / finished) * 100) : null,
        recent: recentRuns.map((run) => ({
          ...run,
          siteAccount: safeSiteAccount(run.siteAccount),
          task: run.task
            ? {
                ...run.task,
                binding: run.task.binding
                  ? {
                      ...run.task.binding,
                      siteAccount: safeSiteAccount(run.task.binding.siteAccount),
                    }
                  : null,
              }
            : null,
        })),
      },
      points: {
        total: pointsTotal,
        expiring: pointsExpiring,
        nextExpiryAt: nextExpiryAt?.toISOString() ?? null,
        accounts: pointAccounts.length,
        byName: [...pointGroups.values()].sort((a, b) => b.total - a.total),
      },
      products: {
        total: products.length,
        onSale: products.filter((row) => row.status === 'on_sale').length,
        lowStock: products.filter((row) => row.status === 'on_sale' && (row.stock ?? 0) <= 10).length,
        totalStock: products.reduce((sum, row) => sum + (row.stock ?? 0), 0),
      },
      grab: {
        total: grab.length,
        onSale: grab.filter((row) => row.status === 'on_sale').length,
        lowStock: grab.filter((row) => row.status === 'on_sale' && (row.stock ?? 0) <= 10).length,
      },
      activities: {
        total: activitiesTotal,
        completed: activitiesDone,
      },
      orders: {
        total: orderAgg,
        success: orderSuccess,
        failed: orderFailed,
      },
      yyb: {
        total: yybSuccess + yybFailed,
        success: yybSuccess,
        failed: yybFailed,
      },
      notifications: {
        total: notifications,
        failed: notificationFailed,
        recent: recentNotifications,
      },
      schedules: schedules.map((item) => ({
        id: item.id,
        name: item.name,
        filePath: item.filePath,
        cron: item.cron,
        nextRunAt: item.nextRunAt?.toISOString() ?? null,
        site: item.site,
      })),
    };
  }
}
