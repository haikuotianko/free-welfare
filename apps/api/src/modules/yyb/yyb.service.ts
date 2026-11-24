import { Injectable } from '@nestjs/common';
import type { Prisma } from '@free-welfare/db';
import { DEFAULT_TIMEZONE } from '@free-welfare/shared';
import { PrismaService } from '../../database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AppError } from '../../common/app-error';

interface YybAccount {
  id: number;
  display_name?: string;
  remark?: string;
  status?: string;
  openid_masked?: string;
  scan_product?: string;
  updated_at?: string | number;
}

function parseYybTime(value?: string | number): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') {
    return new Date(value < 1e12 ? value * 1000 : value);
  }
  if (/^\d+$/.test(value)) {
    const numeric = Number(value);
    return new Date(numeric < 1e12 ? numeric * 1000 : numeric);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

@Injectable()
export class YybService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async health() {
    const { baseUrl } = await this.requireConfig();
    const { response, body } = await this.yybRequest({
      type: 'health',
      baseUrl,
      path: '/health',
      success: (res) => res.ok,
    });
    return { ok: response.ok, status: response.status, body };
  }

  async testConnection(input: {
    baseUrl?: string;
    integrationToken?: string;
    protocolToken?: string;
  } = {}) {
    const config = await this.settings.getYybConfig();
    const baseUrl = (input.baseUrl?.trim() || config.baseUrl || '').replace(/\/+$/, '');
    if (!baseUrl) {
      throw new AppError('yyb_not_configured', '请先填写 YYB 地址（YYB_BASE_URL）', 400);
    }
    let parsed: URL;
    try {
      parsed = new URL(baseUrl);
    } catch {
      throw new AppError('validation_failed', 'YYB 地址不是合法 URL', 400);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new AppError('validation_failed', 'YYB 地址只支持 http(s)', 400);
    }

    const integrationToken =
      input.integrationToken?.trim() || config.integrationToken || '';
    const protocolToken = input.protocolToken?.trim() || config.protocolToken || '';

    const checks: Array<{
      key: string;
      label: string;
      ok: boolean;
      skipped?: boolean;
      accountCount?: number;
      httpStatus: number | null;
      message: string;
    }> = [];

    const health = await this.probeYyb(baseUrl, '/health');
    checks.push({
      key: 'health',
      label: 'YYB 服务',
      ok: health.ok,
      httpStatus: health.status,
      message: health.ok
        ? `HTTP ${health.status}，服务可达`
        : this.probeError(health),
    });

    const manifest = await this.probeYyb(baseUrl, '/integration/module-manifest.json');
    checks.push({
      key: 'integration',
      label: '集成接口',
      ok: manifest.ok,
      httpStatus: manifest.status,
      message: manifest.ok
        ? `HTTP ${manifest.status}，集成模块已启用`
        : manifest.status === 404
          ? 'HTTP 404，YYB 未启用集成接口或版本过旧'
          : this.probeError(manifest),
    });

    let accountCount: number | undefined;
    if (integrationToken) {
      const accounts = await this.probeYyb(baseUrl, '/integration/accounts', {
        headers: { Authorization: `Bearer ${integrationToken}` },
      });
      const count = Array.isArray(accounts.body?.data?.items)
        ? accounts.body.data.items.length
        : Array.isArray(accounts.body?.items)
          ? accounts.body.items.length
          : undefined;
      accountCount = accounts.ok ? (count ?? 0) : undefined;
      checks.push({
        key: 'accounts',
        label: '集成令牌',
        ok: accounts.ok,
        accountCount,
        httpStatus: accounts.status,
        message: accounts.ok
          ? `HTTP ${accounts.status}，读取到 ${count ?? 0} 个账号`
          : accounts.status === 401
            ? 'HTTP 401，YYB_INTEGRATION_TOKEN 与 YYB 不一致'
            : accounts.status === 503
              ? 'HTTP 503，YYB 未启用集成接口（容器未读取 YYB_INTEGRATION_TOKEN）'
              : this.probeError(accounts),
      });
    } else {
      checks.push({
        key: 'accounts',
        label: '集成令牌',
        ok: false,
        httpStatus: null,
        message: '未填写 YYB_INTEGRATION_TOKEN，无法同步账号',
      });
    }

    checks.push({
      key: 'protocol',
      label: '协议令牌',
      ok: accountCount !== undefined && accountCount > 0,
      skipped: accountCount === undefined || accountCount === 0,
      accountCount,
      httpStatus: null,
      message:
        accountCount === undefined
          ? '集成令牌未通过，暂时无法确认账号数量'
          : accountCount > 0
            ? `已有 ${accountCount} 个账号，无需重新扫码；协议令牌未单独验证`
            : protocolToken
              ? '还没有微信账号，先扫码添加一个'
              : '还没有微信账号；请先配置 YYB_PROTOCOL_TOKEN，再扫码添加',
    });

    const ok = checks
      .filter((check) => !check.skipped)
      .every((check) => check.ok);
    return {
      ok,
      baseUrl,
      checks,
      message: ok
        ? 'YYB 服务与集成接口可用'
        : 'YYB 连接未完全通过，请查看下方结果',
    };
  }

  async syncAccounts() {
    const { baseUrl, integrationToken } = await this.requireConfig();
    const { response, body } = await this.yybRequest({
      type: 'sync-accounts',
      baseUrl,
      path: '/integration/accounts',
      init: { headers: { Authorization: `Bearer ${integrationToken}` } },
      success: (res) => res.ok,
    });
    if (!response.ok) {
      throw new AppError('yyb_unavailable', `YYB 账号同步失败：HTTP ${response.status}`, 502);
    }
    const payload = body as {
      items?: YybAccount[];
      data?: { items?: YybAccount[]; count?: number };
    };
    const items = payload.data?.items ?? payload.items ?? [];
    const existingCount = await this.prisma.client.wechatAccount.count();
    let createdCount = 0;
    for (const item of items) {
      const existing = await this.prisma.client.wechatAccount.findUnique({
        where: { yybRef: String(item.id) },
        select: { id: true },
      });
      await this.prisma.client.wechatAccount.upsert({
        where: { yybRef: String(item.id) },
        create: {
          yybRef: String(item.id),
          displayName: item.display_name || item.remark || '微信账号',
          remark: item.remark,
          status: item.status ?? 'unknown',
          scanProduct: item.scan_product,
          openidMasked: item.openid_masked,
          // 新账号默认按当前账号数量顺延；第一个账号为 0。
          timeOffsetMinutes: existingCount + createdCount,
          lastSyncedAt: parseYybTime(item.updated_at) ?? new Date(),
        },
        update: {
          displayName: item.display_name || item.remark || '微信账号',
          remark: item.remark,
          status: item.status ?? 'unknown',
          scanProduct: item.scan_product,
          openidMasked: item.openid_masked,
          lastSyncedAt: parseYybTime(item.updated_at) ?? new Date(),
        },
      });
      if (!existing) createdCount += 1;
    }
    return { count: items.length, items: await this.listAccounts() };
  }

  listAccounts() {
    return this.prisma.client.wechatAccount.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async overview() {
    const accounts = await this.prisma.client.wechatAccount.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        displayName: true,
        yybRef: true,
        remark: true,
        status: true,
        scanProduct: true,
        openidMasked: true,
        avatarUrl: true,
        disabled: true,
        timeOffsetMinutes: true,
        lastSyncedAt: true,
        createdAt: true,
        updatedAt: true,
        accountForms: {
          select: {
            id: true,
            templateId: true,
            values: true,
            updatedAt: true,
            template: {
              select: { id: true, name: true, description: true, fields: true },
            },
          },
        },
        siteAccounts: {
          select: {
            id: true,
            siteId: true,
            businessUserId: true,
            nickname: true,
            status: true,
            disabled: true,
            envVars: true,
            lastLoginAt: true,
            createdAt: true,
            updatedAt: true,
            site: {
              select: {
                id: true,
                key: true,
                name: true,
                appId: true,
                iconUrl: true,
                pointsName: true,
                scripts: {
                  where: {
                    OR: [{ filePath: 'sign-in.js' }, { capabilities: { has: 'sign_in' } }],
                  },
                  orderBy: { createdAt: 'asc' },
                  select: {
                    id: true,
                    name: true,
                    cron: true,
                    nextRunAt: true,
                    lastRunAt: true,
                    enabled: true,
                  },
                },
              },
            },
            pointAccount: {
              select: {
                balance: true,
                currency: true,
                expiringAmount: true,
                nextExpiryAt: true,
                estimated: true,
                lastSyncedAt: true,
              },
            },
          },
        },
      },
    });

    const accountIds = accounts.flatMap((account) => account.siteAccounts.map((item) => item.id));
    const runs = accountIds.length
      ? await this.prisma.client.run.findMany({
          where: {
            siteAccountId: { in: accountIds },
            siteScript: {
              OR: [{ filePath: 'sign-in.js' }, { capabilities: { has: 'sign_in' } }],
            },
          },
          orderBy: { createdAt: 'desc' },
          distinct: ['siteAccountId'],
          select: {
            id: true,
            siteAccountId: true,
            status: true,
            summary: true,
            createdAt: true,
            errorCode: true,
            errorMessage: true,
          },
        })
      : [];
    const latestRuns = new Map(runs.map((run) => [run.siteAccountId, run]));
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: DEFAULT_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const [year, month, date] = today.split('-').map(Number);
    const dayStart = new Date(year, month - 1, date);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const runStatsRows = accountIds.length
      ? await this.prisma.client.run.groupBy({
          by: ['siteAccountId', 'status'],
          where: {
            siteAccountId: { in: accountIds },
            createdAt: { gte: dayStart, lt: dayEnd },
          },
          _count: { _all: true },
        })
      : [];

    type RunStats = {
      total: number;
      succeeded: number;
      failed: number;
      running: number;
      other: number;
    };
    const emptyStats = (): RunStats => ({
      total: 0,
      succeeded: 0,
      failed: 0,
      running: 0,
      other: 0,
    });
    const statsBySiteAccount = new Map<string, RunStats>();
    for (const row of runStatsRows) {
      if (!row.siteAccountId) continue;
      const stats = statsBySiteAccount.get(row.siteAccountId) ?? emptyStats();
      const count = row._count._all;
      stats.total += count;
      if (row.status === 'succeeded') stats.succeeded += count;
      else if (row.status === 'failed' || row.status === 'timeout') stats.failed += count;
      else if (row.status === 'running' || row.status === 'starting' || row.status === 'queued') stats.running += count;
      else stats.other += count;
      statsBySiteAccount.set(row.siteAccountId, stats);
    }
    const statsByAccount = new Map<string, RunStats>();
    for (const account of accounts) {
      const stats = emptyStats();
      for (const siteAccount of account.siteAccounts) {
        const item = statsBySiteAccount.get(siteAccount.id);
        if (!item) continue;
        stats.total += item.total;
        stats.succeeded += item.succeeded;
        stats.failed += item.failed;
        stats.running += item.running;
        stats.other += item.other;
      }
      statsByAccount.set(account.id, stats);
    }

    return accounts.map((account) => ({
      ...account,
      runStats: statsByAccount.get(account.id) ?? emptyStats(),
      siteAccounts: account.siteAccounts.map((siteAccount) => {
        const run = latestRuns.get(siteAccount.id);
        const summary = (run?.summary ?? null) as {
          message?: string;
          alreadyDone?: boolean;
          details?: { action?: string };
        } | null;
        const runDate = run
          ? new Intl.DateTimeFormat('en-CA', {
              timeZone: DEFAULT_TIMEZONE,
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            }).format(run.createdAt)
          : null;
        let signInStatus = 'unknown';
        if (run) {
          if (run.status === 'queued' || run.status === 'starting' || run.status === 'running') signInStatus = 'running';
          else if (run.status === 'succeeded') signInStatus = runDate === today ? 'done' : 'pending';
          else signInStatus = 'failed';
        }
        const signScript =
          siteAccount.site.scripts.find((item) => item.enabled && item.cron) ??
          siteAccount.site.scripts.find((item) => item.cron) ??
          siteAccount.site.scripts[0] ??
          null;
        return {
          ...siteAccount,
          runStats: statsBySiteAccount.get(siteAccount.id) ?? emptyStats(),
          signIn: {
            runId: run?.id ?? null,
            status: signInStatus,
            at: run?.createdAt.toISOString() ?? null,
            message: summary?.message ?? run?.errorMessage ?? null,
            errorCode: run?.errorCode ?? null,
            action: summary?.details?.action ?? null,
            schedule: signScript
              ? {
                  scriptId: signScript.id,
                  name: signScript.name,
                  cron: signScript.cron,
                  enabled: signScript.enabled,
                  nextRunAt: signScript.nextRunAt?.toISOString() ?? null,
                  lastRunAt: signScript.lastRunAt?.toISOString() ?? null,
                }
              : null,
          },
        };
      }),
    }));
  }

  async updateAccount(id: string, input: { timeOffsetMinutes?: number; disabled?: boolean }) {
    const account = await this.prisma.client.wechatAccount.findUnique({ where: { id } });
    if (!account) throw new AppError('not_found', '账号不存在', 404);
    return this.prisma.client.wechatAccount.update({
      where: { id },
      data: {
        ...(input.timeOffsetMinutes !== undefined
          ? { timeOffsetMinutes: input.timeOffsetMinutes }
          : {}),
        ...(input.disabled !== undefined ? { disabled: input.disabled } : {}),
      },
    });
  }

  async refreshAccount(id: string) {
    const account = await this.prisma.client.wechatAccount.findUnique({ where: { id } });
    if (!account) throw new AppError('not_found', '账号不存在', 404);
    const { baseUrl, integrationToken } = await this.requireConfig();
    const { response, body } = await this.yybRequest({
      type: 'refresh-account',
      baseUrl,
      path: '/integration/actions/refresh-account',
      init: {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${integrationToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: account.yybRef }),
      },
      success: (res) => res.ok,
      wechatAccountId: account.id,
      wechatAccountName: account.displayName,
    });
    if (!response.ok) {
      throw new AppError('yyb_unavailable', `刷新失败：HTTP ${response.status}`, 502);
    }
    return body;
  }

  private async requireConfig() {
    const { baseUrl, integrationToken } = await this.settings.getYybConfig();
    if (!baseUrl || !integrationToken) {
      throw new AppError('yyb_not_configured', '请先在设置里配置 YYB 地址和集成令牌', 400);
    }
    return { baseUrl: baseUrl.replace(/\/+$/, ''), integrationToken };
  }

  private async requireQrConfig() {
    const { baseUrl, protocolToken } = await this.settings.getYybConfig();
    if (!baseUrl || !protocolToken) {
      throw new AppError('yyb_not_configured', '请先在设置里配置 YYB 地址和协议令牌', 400);
    }
    return { baseUrl: baseUrl.replace(/\/+$/, ''), protocolToken };
  }

  async createQrSession() {
    const { baseUrl, protocolToken } = await this.requireQrConfig();
    const { response, body } = await this.yybRequest({
      type: 'qr-create',
      baseUrl,
      path: '/wx/qrcodeauth?as_base64=true',
      init: {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${protocolToken}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      },
      success: (res, data) =>
        res.ok && Number((data as any)?.code) === 0 && Boolean((data as any)?.data?.session_id),
    });
    if (!response.ok || Number(body?.code) !== 0 || !body?.data?.session_id) {
      throw new AppError(
        'yyb_qr_failed',
        body?.msg || `创建扫码会话失败（HTTP ${response.status}）`,
        502,
      );
    }
    return {
      sessionId: String(body.data.session_id),
      status: String(body.data.status || 'pending'),
      image:
        typeof body.data.image_base64 === 'string' && body.data.image_base64.startsWith('data:')
          ? body.data.image_base64
          : null,
      product: body.data.product ?? null,
    };
  }

  async pollQrSession(sessionId: string) {
    const { baseUrl, protocolToken } = await this.requireQrConfig();
    const headers = { Authorization: `Bearer ${protocolToken}` };
    const { response, body } = await this.yybRequest({
      type: 'qr-poll',
      baseUrl,
      path: `/wx/qrcodeauth/${encodeURIComponent(sessionId)}/poll`,
      init: { headers },
      success: (res) => res.ok,
    });
    if (!response.ok) {
      throw new AppError(
        'yyb_qr_failed',
        body?.msg || `查询扫码状态失败（HTTP ${response.status}）`,
        502,
      );
    }

    const status = String(body?.data?.status ?? body?.status ?? 'unknown');
    if (status === 'confirmed') {
      const result = await this.syncAccounts();
      return { status, accounts: result.items };
    }
    if (status === 'authorized') {
      const confirm = await this.yybRequest({
        type: 'qr-confirm',
        baseUrl,
        path: `/wx/qrcodeauth/${encodeURIComponent(sessionId)}/confirm`,
        init: {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: '{}',
        },
        success: (res, data) =>
          res.ok && ((data as any)?.code === undefined || Number((data as any).code) === 0),
      });
      const confirmBody = confirm.body as any;
      if (
        !confirm.response.ok ||
        (confirmBody?.code !== undefined && Number(confirmBody.code) !== 0)
      ) {
        return {
          status,
          message: confirmBody?.msg || `确认账号失败（HTTP ${confirm.response.status}）`,
        };
      }
      const result = await this.syncAccounts();
      return {
        status: 'confirmed',
        account: confirmBody?.data ?? confirmBody ?? null,
        accounts: result.items,
      };
    }

    return { status };
  }

  async listRequests(input: {
    page: number;
    pageSize: number;
    type?: string;
    status?: 'success' | 'failed';
    account?: string;
    site?: string;
    wechatAccountId?: string;
    siteId?: string;
  }) {
    const where: Prisma.YybRequestLogWhereInput = {};
    if (input.type) where.type = input.type;
    if (input.status) where.status = input.status;
    if (input.wechatAccountId) where.wechatAccountId = input.wechatAccountId;
    if (input.siteId) where.siteId = input.siteId;

    const and: Prisma.YybRequestLogWhereInput[] = [];
    if (input.account) {
      and.push({
        OR: [
          { wechatAccountId: { contains: input.account, mode: 'insensitive' } },
          { wechatAccountName: { contains: input.account, mode: 'insensitive' } },
        ],
      });
    }
    if (input.site) {
      and.push({
        OR: [
          { siteId: { contains: input.site, mode: 'insensitive' } },
          { siteName: { contains: input.site, mode: 'insensitive' } },
        ],
      });
    }
    if (and.length) where.AND = and;

    const [items, total, groups] = await Promise.all([
      this.prisma.client.yybRequestLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.client.yybRequestLog.count({ where }),
      this.prisma.client.yybRequestLog.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
    ]);
    const countOf = (status: string) =>
      groups.find((row) => row.status === status)?._count._all ?? 0;

    return {
      items,
      total,
      success: countOf('success'),
      failed: countOf('failed'),
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  private probeError(result: {
    status: number | null;
    body: any;
    error?: string;
  }): string {
    if (result.error) return result.error;
    const message =
      typeof result.body === 'object' && result.body
        ? result.body.msg || result.body.message
        : undefined;
    if (message) return `HTTP ${result.status ?? '—'}：${String(message).slice(0, 200)}`;
    return `HTTP ${result.status ?? '—'}，服务返回异常`;
  }

  private async probeYyb(
    baseUrl: string,
    path: string,
    init?: RequestInit,
  ): Promise<{
    ok: boolean;
    status: number | null;
    body: any;
    error?: string;
  }> {
    const started = Date.now();
    const method = String(init?.method ?? 'GET').toUpperCase();
    let response: Response | null = null;
    try {
      response = await fetch(baseUrl + path, {
        ...init,
        signal: AbortSignal.timeout(10_000),
      });
      const text = await response.text();
      let body: any = null;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text.slice(0, 300);
        }
      }
      await this.logYyb({
        type: 'test-connection',
        method,
        path,
        status: response.ok ? 'success' : 'failed',
        httpStatus: response.status,
        durationMs: Date.now() - started,
        errorMessage: response.ok
          ? null
          : this.probeError({ status: response.status, body }),
      });
      return { ok: response.ok, status: response.status, body };
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      const message = /abort|timeout/i.test(rawMessage)
        ? '连接超时（10 秒）'
        : /fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(rawMessage)
          ? `无法连接：${rawMessage}`
          : rawMessage;
      await this.logYyb({
        type: 'test-connection',
        method,
        path,
        status: 'failed',
        httpStatus: response?.status ?? null,
        durationMs: Date.now() - started,
        errorMessage: message,
      });
      return {
        ok: false,
        status: response?.status ?? null,
        body: null,
        error: message,
      };
    }
  }

  private async yybRequest(input: {
    type: string;
    baseUrl: string;
    path: string;
    init?: RequestInit;
    success?: (response: Response, body: any) => boolean;
    wechatAccountId?: string;
    wechatAccountName?: string;
    siteId?: string;
    siteName?: string;
    siteAccountId?: string;
  }): Promise<{ response: Response; body: any }> {
    const started = Date.now();
    const method = String(input.init?.method ?? 'GET').toUpperCase();
    const logPath = input.path.split('?')[0];
    let response: Response | null = null;
    try {
      response = await fetch(input.baseUrl + input.path, input.init);
      const body = (await response.json().catch(() => null)) as any;
      const ok = input.success
        ? input.success(response, body)
        : response.ok && (body?.code === undefined || Number(body.code) === 0);
      await this.logYyb({
        type: input.type,
        method,
        path: logPath,
        status: ok ? 'success' : 'failed',
        httpStatus: response.status,
        durationMs: Date.now() - started,
        errorMessage: ok
          ? null
          : String(
              body?.msg ||
                body?.message ||
                (response.ok ? '返回数据异常' : `HTTP ${response.status}`),
            ).slice(0, 500),
        wechatAccountId: input.wechatAccountId,
        wechatAccountName: input.wechatAccountName,
        siteId: input.siteId,
        siteName: input.siteName,
        siteAccountId: input.siteAccountId,
      });
      return { response, body };
    } catch (error) {
      await this.logYyb({
        type: input.type,
        method,
        path: logPath,
        status: 'failed',
        httpStatus: response?.status ?? null,
        durationMs: Date.now() - started,
        errorMessage: error instanceof Error ? error.message : String(error),
        wechatAccountId: input.wechatAccountId,
        wechatAccountName: input.wechatAccountName,
        siteId: input.siteId,
        siteName: input.siteName,
        siteAccountId: input.siteAccountId,
      });
      throw error;
    }
  }

  private async logYyb(input: {
    type: string;
    method: string;
    path: string;
    status: string;
    httpStatus: number | null;
    durationMs: number;
    errorMessage: string | null;
    wechatAccountId?: string;
    wechatAccountName?: string;
    siteId?: string;
    siteName?: string;
    siteAccountId?: string;
  }): Promise<void> {
    try {
      await this.prisma.client.yybRequestLog.create({
        data: {
          type: input.type,
          source: 'api',
          method: input.method,
          path: input.path,
          status: input.status,
          httpStatus: input.httpStatus,
          durationMs: input.durationMs,
          errorMessage: input.errorMessage,
          wechatAccountId: input.wechatAccountId ?? null,
          wechatAccountName: input.wechatAccountName ?? null,
          siteId: input.siteId ?? null,
          siteName: input.siteName ?? null,
          siteAccountId: input.siteAccountId ?? null,
        },
      });
    } catch (error) {
      console.error('write yyb request log failed', error);
    }
  }
}
