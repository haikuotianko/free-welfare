import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { DEFAULT_TIMEZONE } from '@free-welfare/shared';
import { Prisma } from '@free-welfare/db';
import {
  CLOCK_SETTING_KEY,
  QUEUE_SETTING_KEY,
  effectiveRunTimeoutMinutes,
  platformNow,
  readClockState,
  readQueueConfig,
  type QueueConfig,
} from '@free-welfare/domain';
import type {
  ActivityInput,
  HttpRequestOptions,
  HttpResponse,
  OrderInput,
  PointLotInput,
  PointTransactionInput,
  ProductInput,
  ProductKind,
  ProductListOptions,
  ProductRecord,
  ProductSyncOptions,
  ProductSyncResult,
  RunInfo,
  RunResult,
} from '@free-welfare/sdk';
import { PrismaService } from '../database/prisma.service';
import { decryptSecret, encryptSecret } from './secrets';
import { redactText, redactValue } from './redact';
import { nextCronTime } from './cron';
import type {
  RpcRequestMessage,
  ScriptWorkerData,
  WorkerToParentMessage,
} from './protocol';

function dataRoot(): string {
  if (process.env.DATA_DIR) return resolve(process.env.DATA_DIR);
  const candidates = [resolve(process.cwd(), 'data'), resolve(process.cwd(), '..', '..', 'data')];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

function safeJoin(root: string, child: string): string {
  const full = resolve(root, child);
  const rel = relative(root, full);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('path escapes workspace');
  return full;
}

function splitArgs(input: string): string[] {
  return input.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((item) => item.replace(/^"|"$/g, '')) ?? [];
}

function nowIso(): string {
  return new Date().toISOString();
}

interface RunRuntime {
  runId: string;
  site: any;
  siteScript?: any;
  account: any;
  runInfo: RunInfo;
  mode: 'platform' | 'qinglong';
  networkMode: string;
  allowedOrigins: string[];
  env: Record<string, string>;
  appConfig: Record<string, unknown>;
  cacheRun: Map<string, unknown>;
  session?: unknown;
}

@Injectable()
export class RunnerService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private scheduleTimer?: NodeJS.Timeout;
  private ticking = false;
  private scheduling = false;
  private readonly activeRuns = new Map<string, Promise<void>>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    console.log('worker: polling queued runs');
    void this.recoverStaleRuns();
    this.timer = setInterval(() => {
      void this.tick();
    }, 1000);
    // 只在这个进程启动时检查一次错过的定时任务；之后按正常 15 秒调度。
    await this.applyStartupSchedulePolicy();
    this.scheduleTimer = setInterval(() => {
      void this.tickSchedules();
    }, 15_000);
    void this.tickSchedules();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.scheduleTimer) clearInterval(this.scheduleTimer);
  }

  private async recoverStaleRuns(): Promise<void> {
    try {
      const stale = await this.prisma.client.run.findMany({
        where: { status: 'running' },
        select: { id: true },
      });
      if (stale.length === 0) return;
      await this.prisma.client.run.updateMany({
        where: { status: 'running' },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          errorCode: 'worker_restarted',
          errorMessage: 'Worker restarted before this run finished',
          summary: { ok: false, message: 'Worker 重启，运行被标记失败' },
        },
      });
      await this.prisma.client.runLog.createMany({
        data: stale.map((row) => ({
          runId: row.id,
          level: 'error',
          message: 'Worker 重启，运行被标记失败；可以手动重跑',
        })),
      });
      console.log(`worker: recovered ${stale.length} stale running runs`);
    } catch (error) {
      console.error('recover stale runs failed', error);
    }
  }

  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const config = await this.queueConfig();

      const now = new Date();
      const active = await this.prisma.client.run.findMany({
        where: { status: { in: ['starting', 'running'] } },
        select: { status: true, siteId: true, siteAccountId: true },
      });

      const activeByAccount = new Map<string, number>();
      const activeBySite = new Map<string, number>();
      for (const run of active) {
        if (run.siteAccountId) {
          activeByAccount.set(
            run.siteAccountId,
            (activeByAccount.get(run.siteAccountId) ?? 0) + 1,
          );
        }
        if (run.siteId) {
          activeBySite.set(run.siteId, (activeBySite.get(run.siteId) ?? 0) + 1);
        }
      }

      // starting 已经占用了并发额度，直接认领成 running，不额外占用新额度。
      const starting = await this.prisma.client.run.findMany({
        where: { status: 'starting' },
        orderBy: { createdAt: 'asc' },
        take: 100,
        select: { id: true },
      });
      for (const candidate of starting) {
        const claimed = await this.prisma.client.run.updateMany({
          where: { id: candidate.id, status: 'starting' },
          data: { status: 'running', startedAt: new Date() },
        });
        if (claimed.count === 1) this.startRun(candidate.id);
      }

      let slots = config.concurrency - active.length;
      if (slots <= 0) return;

      const queued = await this.prisma.client.run.findMany({
        where: {
          status: 'queued',
          OR: [{ notBefore: null }, { notBefore: { lte: now } }],
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
        select: { id: true, siteId: true, siteAccountId: true },
      });

      for (const candidate of queued) {
        if (slots <= 0) break;
        if (
          candidate.siteAccountId &&
          (activeByAccount.get(candidate.siteAccountId) ?? 0) >=
            config.perAccountConcurrency
        ) {
          continue;
        }
        if (
          config.perSiteConcurrency > 0 &&
          candidate.siteId &&
          (activeBySite.get(candidate.siteId) ?? 0) >= config.perSiteConcurrency
        ) {
          continue;
        }

        const claimed = await this.prisma.client.run.updateMany({
          where: { id: candidate.id, status: 'queued' },
          data: { status: 'running', startedAt: new Date() },
        });
        if (claimed.count !== 1) continue;

        slots -= 1;
        if (candidate.siteAccountId) {
          activeByAccount.set(
            candidate.siteAccountId,
            (activeByAccount.get(candidate.siteAccountId) ?? 0) + 1,
          );
        }
        if (candidate.siteId) {
          activeBySite.set(
            candidate.siteId,
            (activeBySite.get(candidate.siteId) ?? 0) + 1,
          );
        }
        this.startRun(candidate.id);
      }
    } catch (error) {
      console.error('worker tick failed', error);
    } finally {
      this.ticking = false;
    }
  }

  private startRun(runId: string): void {
    const task = this.execute(runId)
      .catch((error) => {
        console.error(`worker run ${runId} failed`, error);
      })
      .finally(() => {
        this.activeRuns.delete(runId);
      });
    this.activeRuns.set(runId, task);
  }

  private async queueConfig(): Promise<QueueConfig> {
    const row = await this.prisma.client.setting.findUnique({
      where: { key: QUEUE_SETTING_KEY },
    });
    return readQueueConfig(row?.value);
  }

  /**
   * 启动时只检查一次：停机期间已经过了计划时间、但还没运行的脚本是否补跑。
   * 关闭补跑时直接把 nextRunAt 推进到下一个周期，避免第一次 tickSchedules 把它们当成正常到期任务。
   */
  private async applyStartupSchedulePolicy(): Promise<void> {
    try {
      const config = await this.queueConfig();
      if (config.runMissedSchedules) return;
      const now = await this.platformNow();
      const scripts = await this.prisma.client.siteScript.findMany({
        where: { enabled: true, cron: { not: '' }, nextRunAt: { lte: now } },
        select: { id: true, cron: true, timezone: true, nextRunAt: true },
      });
      let skipped = 0;
      for (const script of scripts) {
        let next: Date;
        try {
          next = nextCronTime(script.cron, now, script.timezone || DEFAULT_TIMEZONE);
        } catch (error) {
          console.error(`invalid cron for site script ${script.id}:`, error);
          continue;
        }
        const claimed = await this.prisma.client.siteScript.updateMany({
          where: { id: script.id, nextRunAt: { lte: now } },
          data: { nextRunAt: next },
        });
        if (claimed.count === 1) skipped += 1;
      }
      if (skipped > 0) {
        console.log(`worker: skipped ${skipped} missed schedule(s) on startup`);
      }
    } catch (error) {
      console.error('worker: startup schedule check failed', error);
    }
  }

  private async tickSchedules(): Promise<void> {
    if (this.scheduling) return;
    this.scheduling = true;
    try {
      const now = await this.platformNow();
      const config = await this.queueConfig();
      const scripts = await this.prisma.client.siteScript.findMany({
        where: {
          enabled: true,
          cron: { not: '' },
          OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
        },
        include: {
          site: {
            include: {
              siteAccounts: {
                where: { disabled: false },
                include: { wechatAccount: true },
              },
            },
          },
        },
      });

      let queuedCount = await this.prisma.client.run.count({
        where: { status: 'queued' },
      });
      for (const script of scripts) {
        let next: Date;
        try {
          next = nextCronTime(script.cron, now, script.timezone || DEFAULT_TIMEZONE);
        } catch (error) {
          console.error(`invalid cron for site script ${script.id}:`, error);
          continue;
        }

        const claimed = await this.prisma.client.siteScript.updateMany({
          where: {
            id: script.id,
            OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
          },
          data: { nextRunAt: next, lastRunAt: now },
        });
        if (claimed.count !== 1) continue;
        if (script.site.siteAccounts.length === 0) continue;

        for (const account of script.site.siteAccounts) {
          const offsetMinutes = account.wechatAccount?.timeOffsetMinutes ?? 0;
          const notBefore =
            offsetMinutes > 0
              ? new Date(Date.now() + offsetMinutes * 60_000)
              : null;

          if (config.maxQueueSize > 0 && queuedCount >= config.maxQueueSize) {
            const skipped = await this.prisma.client.run.create({
              data: {
                siteScriptId: script.id,
                siteId: script.siteId,
                siteAccountId: account.id,
                notBefore,
                status: 'skipped',
                finishedAt: new Date(),
                errorCode: 'queue_full',
                errorMessage: `队列已满（上限 ${config.maxQueueSize}），本次计划运行已跳过`,
              },
            });
            await this.prisma.client.runLog.create({
              data: {
                runId: skipped.id,
                level: 'warn',
                message: `队列已满（上限 ${config.maxQueueSize}），本次计划运行已自动跳过。`,
              },
            });
            continue;
          }

          await this.prisma.client.run.create({
            data: {
              siteScriptId: script.id,
              siteId: script.siteId,
              siteAccountId: account.id,
              notBefore,
              status: 'queued',
            },
          });
          queuedCount += 1;
        }
      }
    } catch (error) {
      console.error('worker schedule tick failed', error);
    } finally {
      this.scheduling = false;
      void this.tick();
    }
  }

  /** 平台时间 = 服务器时间 + 时间设置里的偏移。 */
  private async platformNow(): Promise<Date> {
    const row = await this.prisma.client.setting.findUnique({
      where: { key: CLOCK_SETTING_KEY },
    });
    const state = readClockState(row?.value);
    return platformNow(state.offsetMs);
  }

  private async execute(runId: string): Promise<void> {
    const started = Date.now();
    try {
      const { data, runtime } = await this.prepare(runId);
      await this.log(runId, 'info', `开始运行 ${runtime.site.name} · ${runtime.runInfo.script.name}`);
      const timeoutMs = Math.max(10_000, runtime.runInfo.timeoutMs);
      const outcome = await this.runWorker(data, runtime, timeoutMs);

      if (outcome.kind === 'timeout') {
        await this.finish(runId, started, 'timeout', 'timeout', '脚本执行超时', { ok: false, message: '执行超时' });
        await this.notifyFailure(runtime, '脚本执行超时');
        return;
      }
      if (outcome.kind === 'error') {
        await this.log(runId, 'error', outcome.error.message, outcome.error.details);
        await this.finish(runId, started, 'failed', outcome.error.code, outcome.error.message, {
          ok: false,
          message: outcome.error.message,
          errorCode: outcome.error.code,
          details: outcome.error.details,
        });
        await this.notifyFailure(runtime, outcome.error.message);
        return;
      }

      const result = (outcome.result ?? {}) as RunResult;
      const ok = result.ok !== false;
      await this.finish(
        runId,
        started,
        ok ? 'succeeded' : 'failed',
        ok ? undefined : result.errorCode ?? 'script_failed',
        ok ? undefined : result.message,
        result,
      );
      await this.log(
        runId,
        ok ? 'info' : 'error',
        result.message ?? (ok ? '运行成功' : '运行失败'),
        ok ? undefined : (result.details ?? result.data),
      );
      if (!ok) await this.notifyFailure(runtime, result.message || '运行失败');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.log(runId, 'error', `运行失败：${message}`);
      await this.finish(runId, started, 'failed', 'runner_error', message, { ok: false, message });
    }
  }

  private async prepare(runId: string): Promise<{ data: ScriptWorkerData; runtime: RunRuntime }> {
    const run = await this.prisma.client.run.findUnique({
      where: { id: runId },
      include: {
        siteScript: true,
        site: true,
        siteAccount: { include: { wechatAccount: true, pointAccount: true } },
        scriptVersion: true,
        task: {
          include: {
            binding: {
              include: {
                site: true,
                siteAccount: { include: { wechatAccount: true, pointAccount: true } },
                script: true,
              },
            },
          },
        },
      },
    });
    if (!run) throw new Error('run not found');
    const runtimeConfig = await this.queueConfig();

    let site = run.site;
    let account = run.siteAccount;
    let mode: 'platform' | 'qinglong' = 'platform';
    let scriptName = '脚本';
    let scriptKey = run.siteScriptId ?? run.taskId ?? 'script';
    let scriptVersion = 'local';
    let filePath = '';
    let workspaceRoot = '';
    let args: string[] = [];
    let capability = 'script';
    let config: Record<string, unknown> = {};
    let timeoutSeconds = 120;

    if (run.siteScript && site && account) {
      const scriptsDir = resolve(dataRoot(), 'apps', site.key, 'scripts');
      workspaceRoot = scriptsDir;
      filePath = safeJoin(scriptsDir, run.siteScript.filePath);
      mode = site.scriptMode === 'qinglong' ? 'qinglong' : 'platform';
      scriptName = run.siteScript.name;
      scriptKey = run.siteScript.id;
      args = splitArgs(run.siteScript.args);
      capability = run.siteScript.capabilities[0] ?? 'script';
      timeoutSeconds =
        effectiveRunTimeoutMinutes(
          site.runTimeoutMinutes,
          runtimeConfig.runTimeoutMinutes,
        ) * 60;
    } else if (run.task && run.task.binding) {
      const binding = run.task.binding;
      site = binding.site;
      account = binding.siteAccount;
      mode = 'platform';
      scriptName = binding.script.name;
      scriptKey = binding.script.key;
      capability = run.task.capability;
      timeoutSeconds = run.task.timeoutSeconds;
      config = (binding.configEnc ?? {}) as Record<string, unknown>;
      const version = run.scriptVersion;
      if (!version?.bundlePath) {
        throw new Error('脚本包不存在，请先从订阅源安装脚本');
      }
      scriptVersion = version.version;
      filePath = resolve(dataRoot(), version.bundlePath);
      workspaceRoot = dirname(filePath);
    } else {
      throw new Error('运行记录缺少应用脚本或任务');
    }

    if (!site || !account) throw new Error('运行记录缺少应用或账号');
    if (!existsSync(filePath)) throw new Error(`脚本文件不存在：${filePath}`);

    const envRows = await this.prisma.client.siteEnvVar.findMany({
      where: { siteId: site.id, enabled: true },
    });
    const env: Record<string, string> = {};
    for (const row of envRows) {
      try {
        env[row.key] = decryptSecret(row.valueEnc);
      } catch {
        // skip values that cannot be decrypted with the current key
      }
    }
    const accountEnv = (account.envVars ?? {}) as Record<string, unknown>;
    const needsFormValues = Object.values(accountEnv).some(
      (value) => typeof value === 'string' && value.includes('{{form.'),
    );
    const formValues = new Map<string, Record<string, unknown>>();
    if (needsFormValues && account.wechatAccountId) {
      const rows = await this.prisma.client.accountForm.findMany({
        where: { wechatAccountId: account.wechatAccountId },
        select: { templateId: true, values: true },
      });
      for (const row of rows) {
        formValues.set(row.templateId, (row.values ?? {}) as Record<string, unknown>);
      }
    }
    const resolveFormValue = (text: string) => {
      if (!text.includes('{{form.')) return text;
      return text.replace(
        /\{\{form\.([^.}]+)\.([^}]+)\}\}/g,
        (_match, templateId, fieldKey) => {
          const values = formValues.get(String(templateId));
          const value = values?.[String(fieldKey)];
          if (value === undefined || value === null) return '';
          if (typeof value === 'string') return value;
          if (typeof value === 'object') return JSON.stringify(value);
          return String(value);
        },
      );
    };
    for (const [key, value] of Object.entries(accountEnv)) {
      if (value === undefined || value === null) continue;
      const raw = typeof value === 'string' ? value : String(value);
      if (!raw.trim()) continue;
      const text = resolveFormValue(raw);
      if (!text.trim()) continue;
      env[key] = text;
    }

    const runInfo: RunInfo = {
      id: run.id,
      taskId: run.taskId ?? '',
      capability,
      attempt: 1,
      trigger: run.taskId ? 'schedule' : 'manual',
      dryRun: false,
      startedAt: nowIso(),
      timeoutMs: timeoutSeconds * 1000,
      mode,
      script: {
        id: scriptKey,
        key: scriptKey,
        name: scriptName,
        version: scriptVersion,
        filePath: run.siteScript?.filePath,
        args: run.siteScript?.args,
      },
      input: (run.input ?? {}) as Record<string, unknown>,
    };

    const data: ScriptWorkerData = {
      run: runInfo,
      mode,
      filename: filePath,
      workspaceRoot,
      app: {
        id: site.id,
        key: site.key,
        name: site.name,
        appId: site.appId,
        platform: site.platform,
        description: site.description,
        iconUrl: site.iconUrl,
        status: site.status,
        mode,
        metadata: (site.metadata ?? {}) as Record<string, unknown>,
      },
      appConfig: (site.config ?? {}) as Record<string, unknown>,
      config,
      env,
      input: (run.input ?? {}) as Record<string, unknown>,
      account: {
        id: account.id,
        wechatAccountId: account.wechatAccountId,
        displayName: account.wechatAccount?.displayName ?? account.wechatAccount?.remark ?? '微信账号',
        yybRef: account.wechatAccount?.yybRef ?? '',
        status: account.status,
        businessUserId: account.businessUserId,
        nickname: account.nickname,
        openidMasked: account.wechatAccount?.openidMasked,
        avatarUrl: account.wechatAccount?.avatarUrl,
        lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
      },
      args,
      allowedOrigins: site.allowedOrigins,
      networkMode: site.networkMode,
    };

    const runtime: RunRuntime = {
      runId,
      site,
      siteScript: run.siteScript,
      account,
      runInfo,
      mode,
      networkMode: site.networkMode,
      allowedOrigins: site.allowedOrigins,
      env,
      appConfig: (site.config ?? {}) as Record<string, unknown>,
      cacheRun: new Map(),
    };
    return { data, runtime };
  }

  private runWorker(
    data: ScriptWorkerData,
    runtime: RunRuntime,
    timeoutMs: number,
  ): Promise<
    | { kind: 'result'; result: unknown }
    | { kind: 'error'; error: { code: string; message: string; details?: unknown } }
    | { kind: 'timeout' }
  > {
    return new Promise((resolvePromise) => {
      const worker = new Worker(resolve(__dirname, 'script-worker.js'), {
        workerData: data,
        resourceLimits: { maxOldGenerationSizeMb: 256 },
      });
      let settled = false;
      const finish = (
        outcome:
          | { kind: 'result'; result: unknown }
          | { kind: 'error'; error: { code: string; message: string; details?: unknown } }
          | { kind: 'timeout' },
      ) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void worker.terminate();
        resolvePromise(outcome);
      };
      const timer = setTimeout(() => finish({ kind: 'timeout' }), timeoutMs);

      worker.on('message', (message: WorkerToParentMessage) => {
        if (message.type === 'rpc') {
          void this.handleRpc(runtime, message)
            .then((value) => worker.postMessage({ type: 'rpc-result', id: message.id, ok: true, value }))
            .catch((error: unknown) => {
              const err = error as { code?: string; message?: string; details?: unknown };
              worker.postMessage({
                type: 'rpc-result',
                id: message.id,
                ok: false,
                error: {
                  code: err.code ?? 'rpc_error',
                  message: err.message ?? String(error),
                  details: err.details,
                },
              });
            });
          return;
        }
        if (message.type === 'log') {
          void this.log(runtime.runId, message.level, message.message, message.data);
          return;
        }
        if (message.type === 'result') {
          finish({ kind: 'result', result: message.result });
          return;
        }
        if (message.type === 'error') {
          finish({ kind: 'error', error: message.error });
        }
      });

      worker.on('error', (error) => {
        finish({ kind: 'error', error: { code: 'worker_error', message: error.message } });
      });
      worker.on('exit', (code) => {
        if (!settled) {
          finish({
            kind: 'error',
            error: { code: 'worker_exited', message: `脚本进程退出（code ${code}）` },
          });
        }
      });
    });
  }

  private async handleRpc(runtime: RunRuntime, message: RpcRequestMessage): Promise<unknown> {
    const args = message.args;
    switch (message.method) {
      case 'cache.get':
        return this.cacheGet(runtime, args[0] as string, args[1] as string);
      case 'cache.set':
        return this.cacheSet(runtime, args[0] as string, args[1] as string, args[2], args[3] as number | undefined);
      case 'cache.delete':
        return this.cacheDelete(runtime, args[0] as string, args[1] as string);
      case 'cache.has':
        return (await this.cacheGet(runtime, args[0] as string, args[1] as string)) !== null;
      case 'cache.increment':
        return this.cacheIncrement(runtime, args[0] as string, args[1] as string, args[2] as number | undefined, args[3] as number | undefined);
      case 'cache.touch':
        return this.cacheTouch(runtime, args[0] as string, args[1] as string, args[2] as number);
      case 'cache.clear':
        return this.cacheClear(runtime, args[0] as string);
      case 'http.request':
        return this.httpRequest(runtime, args[0] as HttpRequestOptions);
      case 'yyb.getCode':
        return this.yybGetCode(runtime, args[0] as { ref?: string; appId?: string } | undefined);
      case 'yyb.getPhoneNumber':
        return this.yybGetPhone(runtime);
      case 'yyb.getPhoneAuth':
        return this.yybGetPhoneAuth(runtime, args[0] as { appId?: string } | undefined);
      case 'yyb.operateWxData':
        return this.yybOperate(runtime, args[0]);
      case 'yyb.health':
        return this.yybHealth();
      case 'yyb.listAccounts':
        return this.yybListAccounts();
      case 'yyb.refreshAccount':
        return this.yybRefresh(runtime);
      case 'user.getInfo':
        return this.userInfo(runtime);
      case 'user.getPhone':
        return this.yybGetPhone(runtime);
      case 'user.getPoints':
        return this.userPoints(runtime);
      case 'session.get':
        return this.sessionGet(runtime);
      case 'session.save':
        return this.sessionSave(runtime, args[0], args[1] as string | undefined);
      case 'session.clear':
        return this.sessionClear(runtime);
      case 'account.refresh':
        return this.yybRefresh(runtime);
      case 'products.list':
        return this.productsList(runtime, args[0] as ProductKind, args[1] as ProductListOptions | undefined);
      case 'products.get':
        return this.productGet(runtime, args[0] as ProductKind, args[1] as string);
      case 'products.upsert':
        return this.productUpsert(runtime, args[0] as ProductKind, args[1] as ProductInput);
      case 'products.upsertMany':
        return this.productsUpsertMany(runtime, args[0] as ProductKind, args[1] as ProductInput[]);
      case 'products.sync':
        return this.productsSync(runtime, args[0] as ProductKind, args[1] as ProductInput[], args[2] as ProductSyncOptions | undefined);
      case 'products.update':
        return this.productUpdate(runtime, args[0] as ProductKind, args[1] as string, args[2] as Partial<ProductInput>);
      case 'products.setStock':
        return this.productUpdate(runtime, args[0] as ProductKind, args[1] as string, { stock: args[2] as number | null });
      case 'products.setStatus':
        return this.productUpdate(runtime, args[0] as ProductKind, args[1] as string, { status: args[2] as string });
      case 'products.remove':
        return this.productRemove(runtime, args[0] as ProductKind, args[1] as string);
      case 'points.get':
        return this.pointsGet(runtime);
      case 'points.sync':
        return this.pointsSync(runtime, args[0] as Record<string, unknown>);
      case 'points.add':
        return this.pointsAdd(runtime, args[0] as number, args[1] as Omit<PointTransactionInput, 'amount' | 'balanceAfter'> | undefined);
      case 'points.spend':
        return this.pointsAdd(runtime, -(args[0] as number), args[1] as Omit<PointTransactionInput, 'amount' | 'balanceAfter'> | undefined);
      case 'points.addLot':
        return this.pointsAddLot(runtime, args[0] as PointLotInput);
      case 'points.listTransactions':
        return this.pointsTransactions(runtime, args[0] as { limit?: number } | undefined);
      case 'points.listLots':
        return this.pointsLots(runtime);
      case 'activities.list':
        return this.activitiesList(runtime, args[0] as { status?: string; limit?: number } | undefined);
      case 'activities.get':
        return this.activityGet(runtime, args[0] as string);
      case 'activities.upsert':
        return this.activityUpsert(runtime, args[0] as ActivityInput);
      case 'activities.upsertMany':
        return this.activitiesUpsertMany(runtime, args[0] as ActivityInput[]);
      case 'activities.sync':
        return this.activitiesUpsertMany(runtime, args[0] as ActivityInput[]);
      case 'activities.setProgress':
        return this.activityProgress(runtime, args[0] as string, args[1] as number, args[2] as number | undefined);
      case 'activities.complete':
        return this.activityProgress(runtime, args[0] as string, 1, 1, 'completed');
      case 'orders.record':
        return this.orderRecord(runtime, args[0] as OrderInput);
      case 'orders.list':
        return this.orderList(runtime, args[0] as { status?: string; limit?: number } | undefined);
      case 'orders.update':
        return this.orderUpdate(runtime, args[0] as string, args[1] as Partial<OrderInput>);
      case 'notify.send':
        return this.notify(runtime, args[0] as { title?: string; body: string; level?: string; data?: unknown });
      case 'artifacts.write':
        return this.artifactWrite(runtime, args[0] as string, args[1] as string, args[2] as 'utf8' | 'base64');
      case 'state.load':
        return this.stateLoad(runtime);
      case 'state.save':
        return this.stateSave(runtime, args[0] as Record<string, unknown>);
      default:
        throw Object.assign(new Error(`unknown runner method: ${message.method}`), {
          code: 'rpc_method_unknown',
        });
    }
  }

  // ── logging / run state ─────────────────────────────────────────────

  private async log(runId: string, level: string, message: string, data?: unknown): Promise<void> {
    try {
      await this.prisma.client.runLog.create({
        data: {
          runId,
          level,
          message: redactText(message).slice(0, 10_000),
          data:
            data === undefined
              ? undefined
              : (redactValue(JSON.parse(JSON.stringify(data))) as Prisma.InputJsonValue),
        },
      });
    } catch (error) {
      console.error('write run log failed', error);
    }
  }

  private async finish(
    runId: string,
    started: number,
    status: string,
    errorCode: string | number | undefined,
    errorMessage: string | undefined,
    summary: unknown,
  ): Promise<void> {
    await this.prisma.client.run.update({
      where: { id: runId },
      data: {
        status,
        finishedAt: new Date(),
        durationMs: Date.now() - started,
        errorCode:
          errorCode === undefined || errorCode === null ? errorCode : String(errorCode),
        errorMessage: errorMessage === undefined ? undefined : redactText(errorMessage),
        summary:
          summary === undefined
            ? undefined
            : (redactValue(summary) as Prisma.InputJsonValue),
      },
    });
  }

  // ── cache ──────────────────────────────────────────────────────────

  private cacheScopeKey(runtime: RunRuntime, scope: string): string {
    if (scope === 'run') return `run/${runtime.runId}`;
    if (scope === 'app') return `app/${runtime.site.id}`;
    return `account/${runtime.site.id}/${runtime.account.id}`;
  }

  private cacheFile(runtime: RunRuntime, scope: string, key: string): string {
    const hash = createHash('sha256').update(key).digest('hex');
    return resolve(dataRoot(), 'cache', this.cacheScopeKey(runtime, scope), `${hash}.json`);
  }

  private async cacheGet(runtime: RunRuntime, scope: string, key: string): Promise<unknown> {
    if (scope === 'run') return runtime.cacheRun.get(key) ?? null;
    try {
      const raw = await readFile(this.cacheFile(runtime, scope, key), 'utf8');
      const entry = JSON.parse(raw) as { value: unknown; expiresAt?: number };
      if (entry.expiresAt && entry.expiresAt < Date.now()) {
        await unlink(this.cacheFile(runtime, scope, key)).catch(() => undefined);
        return null;
      }
      return entry.value ?? null;
    } catch {
      return null;
    }
  }

  private async cacheSet(runtime: RunRuntime, scope: string, key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    if (scope === 'run') {
      runtime.cacheRun.set(key, value);
      return;
    }
    const file = this.cacheFile(runtime, scope, key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(
      file,
      JSON.stringify({
        value,
        expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
      }),
      'utf8',
    );
  }

  private async cacheDelete(runtime: RunRuntime, scope: string, key: string): Promise<boolean> {
    if (scope === 'run') return runtime.cacheRun.delete(key);
    try {
      await unlink(this.cacheFile(runtime, scope, key));
      return true;
    } catch {
      return false;
    }
  }

  private async cacheIncrement(
    runtime: RunRuntime,
    scope: string,
    key: string,
    by = 1,
    ttlSeconds?: number,
  ): Promise<number> {
    const current = Number((await this.cacheGet(runtime, scope, key)) ?? 0) || 0;
    const next = current + by;
    await this.cacheSet(runtime, scope, key, next, ttlSeconds);
    return next;
  }

  private async cacheTouch(runtime: RunRuntime, scope: string, key: string, ttlSeconds: number): Promise<boolean> {
    const value = await this.cacheGet(runtime, scope, key);
    if (value === null) return false;
    await this.cacheSet(runtime, scope, key, value, ttlSeconds);
    return true;
  }

  private async cacheClear(runtime: RunRuntime, scope: string): Promise<void> {
    if (scope === 'run') {
      runtime.cacheRun.clear();
      return;
    }
    await rm(resolve(dataRoot(), 'cache', this.cacheScopeKey(runtime, scope)), {
      recursive: true,
      force: true,
    });
  }

  // ── http ───────────────────────────────────────────────────────────

  private async httpRequest(runtime: RunRuntime, options: HttpRequestOptions): Promise<HttpResponse> {
    const url = new URL(options.url, options.baseURL);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw Object.assign(new Error('只支持 http/https 请求'), { code: 'network_invalid_url' });
    }
    if (runtime.networkMode === 'whitelist' && !runtime.allowedOrigins.includes(url.origin)) {
      throw Object.assign(new Error(`域名不在白名单：${url.origin}`), { code: 'network_denied' });
    }

    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    const hasHeader = (name: string) =>
      Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase());
    let body: string | URLSearchParams | Uint8Array | undefined;
    if (options.json !== undefined) {
      if (!hasHeader('content-type')) headers['content-type'] = 'application/json';
      body = JSON.stringify(options.json);
    } else if (options.form) {
      if (!hasHeader('content-type')) headers['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(
        Object.entries(options.form).map(([key, value]) => [key, String(value ?? '')]) as [
          string,
          string,
        ][],
      );
    } else if (options.body !== undefined) {
      body = options.body;
    }

    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method ?? 'GET',
        headers,
        body: body as RequestInit['body'],
        signal: controller.signal,
        redirect: options.followRedirects === false ? 'manual' : 'follow',
      });
    } finally {
      clearTimeout(timer);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
    const truncated = buffer.length > maxBytes;
    const payload = truncated ? buffer.subarray(0, maxBytes) : buffer;
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    const responseType =
      options.responseType ??
      (responseHeaders['content-type']?.includes('json') ? 'json' : 'text');

    const setCookies =
      typeof (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie ===
      'function'
        ? (response.headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
        : undefined;

    const result: HttpResponse = {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      setCookies,
      finalUrl: response.url,
      truncated,
    };
    if (responseType === 'base64') {
      result.base64 = payload.toString('base64');
    } else if (responseType === 'json') {
      try {
        result.data = JSON.parse(payload.toString('utf8'));
      } catch {
        result.text = payload.toString('utf8');
      }
    } else {
      result.text = payload.toString('utf8');
    }
    return result;
  }

  // ── YYB / account / user ───────────────────────────────────────────

  private async setting(key: string, envKey: string): Promise<string | undefined> {
    const row = await this.prisma.client.setting.findUnique({ where: { key } });
    if (row) {
      const value = row.value as { value?: string; enc?: string };
      if (row.encrypted && value.enc) {
        try {
          return decryptSecret(value.enc);
        } catch {
          return undefined;
        }
      }
      if (value.value) return value.value;
    }
    return process.env[envKey];
  }

  private async yybConfig() {
    const baseUrl = await this.setting('yyb.baseUrl', 'YYB_BASE_URL');
    const integrationToken = await this.setting('yyb.integrationToken', 'YYB_INTEGRATION_TOKEN');
    const protocolToken = await this.setting('yyb.protocolToken', 'YYB_PROTOCOL_TOKEN');
    if (!baseUrl || !integrationToken) {
      throw Object.assign(new Error('YYB 未配置'), { code: 'yyb_not_configured' });
    }
    return { baseUrl: baseUrl.replace(/\/+$/, ''), integrationToken, protocolToken };
  }

  private async yybFetch(
    runtime: RunRuntime | null,
    type: string,
    url: string,
    init: RequestInit,
    success: (response: Response, body: any) => boolean = (res) => res.ok,
  ): Promise<{ response: Response; body: any }> {
    const started = Date.now();
    const method = String(init.method ?? 'GET').toUpperCase();
    let path = url;
    try {
      path = new URL(url).pathname;
    } catch {
      // keep the original URL if it cannot be parsed
    }
    let response: Response | null = null;
    try {
      response = await fetch(url, init);
      const body = (await response.json().catch(() => null)) as any;
      const ok = success(response, body);
      await this.logYybRequest({
        type,
        source: 'worker',
        method,
        path,
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
        runtime,
      });
      return { response, body };
    } catch (error) {
      await this.logYybRequest({
        type,
        source: 'worker',
        method,
        path,
        status: 'failed',
        httpStatus: response?.status ?? null,
        durationMs: Date.now() - started,
        errorMessage: error instanceof Error ? error.message : String(error),
        runtime,
      });
      throw error;
    }
  }

  private async logYybRequest(input: {
    type: string;
    source: string;
    method: string;
    path: string;
    status: string;
    httpStatus: number | null;
    durationMs: number;
    errorMessage: string | null;
    runtime: RunRuntime | null;
  }): Promise<void> {
    try {
      await this.prisma.client.yybRequestLog.create({
        data: {
          type: input.type,
          source: input.source,
          method: input.method,
          path: input.path,
          status: input.status,
          httpStatus: input.httpStatus,
          durationMs: input.durationMs,
          errorMessage: input.errorMessage
            ? redactText(input.errorMessage).slice(0, 500)
            : null,
          wechatAccountId: input.runtime?.account.wechatAccount?.id ?? null,
          wechatAccountName: input.runtime?.account.wechatAccount?.displayName ?? null,
          siteId: input.runtime?.site.id ?? null,
          siteName: input.runtime?.site.name ?? null,
          siteAccountId: input.runtime?.account.id ?? null,
        },
      });
    } catch (error) {
      console.error('write yyb request log failed', error);
    }
  }

  private async yybGetCode(
    runtime: RunRuntime,
    options?: { ref?: string; appId?: string },
  ): Promise<string> {
    const config = await this.yybConfig();
    const { response, body } = await this.yybFetch(
      runtime,
      'get-code',
      `${config.baseUrl}/integration/actions/get-code`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.integrationToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: options?.ref ?? runtime.account.wechatAccount?.yybRef,
          app_id: options?.appId ?? runtime.site.appId,
        }),
      },
      (res, data) => {
        const code =
          data?.result?.code ?? data?.data?.result?.code ?? data?.code ?? data?.data?.code;
        return res.ok && Boolean(code);
      },
    );
    if (!response.ok) {
      throw Object.assign(new Error(`YYB 取码失败：HTTP ${response.status}`), { code: 'yyb_unavailable' });
    }
    const code =
      body?.result?.code ?? body?.data?.result?.code ?? body?.code ?? body?.data?.code;
    if (!code) throw Object.assign(new Error('YYB 未返回 code'), { code: 'yyb_no_code' });
    return String(code);
  }

  private async yybGetPhoneAuth(
    runtime: RunRuntime,
    options?: { appId?: string },
  ): Promise<Record<string, unknown> | null> {
    const config = await this.yybConfig();
    if (!config.protocolToken) return null;
    const { response, body } = await this.yybFetch(
      runtime,
      'get-phone',
      `${config.baseUrl}/wxapp/getPhoneNumber`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.protocolToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: runtime.account.wechatAccount?.yybRef,
          app_id: options?.appId ?? runtime.site.appId,
        }),
      },
      (res) => res.ok,
    );
    if (!response.ok) return null;
    const result = body?.data?.result ?? body?.result ?? body?.data ?? body;
    return result && typeof result === 'object' ? (result as Record<string, unknown>) : null;
  }

  private async yybGetPhone(runtime: RunRuntime): Promise<string | null> {
    const auth = await this.yybGetPhoneAuth(runtime);
    if (!auth) return null;
    let nested: any = auth.data;
    if (typeof nested === 'string') {
      try {
        nested = JSON.parse(nested);
      } catch {
        nested = null;
      }
    }
    const phone =
      auth.phone ??
      auth.purePhoneNumber ??
      nested?.mobile ??
      nested?.phone ??
      nested?.purePhoneNumber;
    return phone ? String(phone) : null;
  }

  private async yybOperate(runtime: RunRuntime, payload: unknown): Promise<unknown> {
    const config = await this.yybConfig();
    if (!config.protocolToken) {
      throw Object.assign(new Error('YYB 协议令牌未配置'), { code: 'yyb_not_configured' });
    }
    const body = {
      ref: runtime.account.wechatAccount?.yybRef,
      ...(payload && typeof payload === 'object' ? payload : { data: payload }),
    };
    const { response, body: result } = await this.yybFetch(
      runtime,
      'operate-wx-data',
      `${config.baseUrl}/wxapp/operateWxData`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.protocolToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      (res) => res.ok,
    );
    if (!response.ok) {
      throw Object.assign(new Error(`YYB operateWxData 失败：HTTP ${response.status}`), {
        code: 'yyb_unavailable',
      });
    }
    return result;
  }

  private async yybHealth(): Promise<{ ok: boolean; status?: number; body?: unknown }> {
    const config = await this.yybConfig();
    const { response, body } = await this.yybFetch(
      null,
      'health',
      `${config.baseUrl}/health`,
      {},
      (res) => res.ok,
    );
    return { ok: response.ok, status: response.status, body };
  }

  private async yybListAccounts(): Promise<unknown[]> {
    const config = await this.yybConfig();
    const { body } = await this.yybFetch(
      null,
      'list-accounts',
      `${config.baseUrl}/integration/accounts`,
      { headers: { Authorization: `Bearer ${config.integrationToken}` } },
      (res) => res.ok,
    );
    return body?.data?.items ?? body?.items ?? [];
  }

  private async yybRefresh(runtime: RunRuntime): Promise<unknown> {
    const config = await this.yybConfig();
    const { response, body } = await this.yybFetch(
      runtime,
      'refresh-account',
      `${config.baseUrl}/integration/actions/refresh-account`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.integrationToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: runtime.account.wechatAccount?.yybRef }),
      },
      (res) => res.ok,
    );
    if (!response.ok) {
      throw Object.assign(new Error(`YYB 刷新账号失败：HTTP ${response.status}`), {
        code: 'yyb_unavailable',
      });
    }
    return body;
  }

  private async userInfo(runtime: RunRuntime): Promise<unknown> {
    const point = runtime.account.pointAccount;
    return {
      accountId: runtime.account.id,
      displayName: runtime.account.wechatAccount?.displayName ?? '微信账号',
      nickname: runtime.account.nickname ?? null,
      phone: null,
      avatarUrl: runtime.account.wechatAccount?.avatarUrl ?? null,
      openidMasked: runtime.account.wechatAccount?.openidMasked ?? null,
      businessUserId: runtime.account.businessUserId ?? null,
      memberLevel: null,
      points: point?.balance ?? null,
      raw: runtime.account.raw ?? null,
    };
  }

  private async userPoints(runtime: RunRuntime): Promise<number | null> {
    const point = await this.prisma.client.pointAccount.findUnique({
      where: { siteAccountId: runtime.account.id },
    });
    return point?.balance ?? null;
  }

  // ── session / state ────────────────────────────────────────────────

  private async sessionGet(runtime: RunRuntime): Promise<unknown> {
    if (runtime.session !== undefined) return runtime.session;
    if (!runtime.account.sessionEnc) return null;
    try {
      const value = runtime.account.sessionEnc.startsWith('v1:')
        ? decryptSecret(runtime.account.sessionEnc)
        : runtime.account.sessionEnc;
      runtime.session = JSON.parse(value);
    } catch {
      runtime.session = null;
    }
    return runtime.session;
  }

  private async sessionSave(runtime: RunRuntime, value: unknown, expiresAt?: string): Promise<void> {
    runtime.session = value;
    runtime.account.sessionEnc = encryptSecret(JSON.stringify(value));
    await this.prisma.client.siteAccount.update({
      where: { id: runtime.account.id },
      data: {
        sessionEnc: runtime.account.sessionEnc,
        sessionExpiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });
  }

  private async sessionClear(runtime: RunRuntime): Promise<void> {
    runtime.session = null;
    runtime.account.sessionEnc = null;
    await this.prisma.client.siteAccount.update({
      where: { id: runtime.account.id },
      data: { sessionEnc: null, sessionExpiresAt: null },
    });
  }

  private stateFile(runtime: RunRuntime): string {
    return resolve(dataRoot(), 'state', runtime.site.id, `${runtime.account.id}.json`);
  }

  private async stateLoad(runtime: RunRuntime): Promise<Record<string, unknown>> {
    try {
      return JSON.parse(await readFile(this.stateFile(runtime), 'utf8')) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private async stateSave(runtime: RunRuntime, value: Record<string, unknown>): Promise<void> {
    const file = this.stateFile(runtime);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(value), 'utf8');
  }

  // ── products ───────────────────────────────────────────────────────

  private productRecord(product: any): ProductRecord {
    return {
      id: product.id,
      kind: product.kind as ProductKind,
      externalId: product.externalId,
      name: product.name,
      description: product.description,
      imageUrl: product.imageUrl,
      pointsCost: product.pointsCost,
      cashCost: product.cashCost === null || product.cashCost === undefined ? null : Number(product.cashCost),
      stock: product.stock,
      status: product.status,
      limitPerUser: product.limitPerUser,
      startAt: product.startAt?.toISOString() ?? null,
      endAt: product.endAt?.toISOString() ?? null,
      raw: product.raw,
      firstSeenAt: product.firstSeenAt?.toISOString(),
      lastSeenAt: product.lastSeenAt?.toISOString(),
    };
  }

  private async productsList(runtime: RunRuntime, kind: ProductKind, options?: ProductListOptions): Promise<ProductRecord[]> {
    const rows = await this.prisma.client.product.findMany({
      where: {
        siteId: runtime.site.id,
        kind,
        ...(options?.status ? { status: options.status } : {}),
        ...(options?.keyword ? { name: { contains: options.keyword, mode: 'insensitive' } } : {}),
      },
      orderBy: { lastSeenAt: 'desc' },
      take: options?.limit ?? 100,
    });
    return rows.map((row) => this.productRecord(row));
  }

  private async productGet(runtime: RunRuntime, kind: ProductKind, externalId: string): Promise<ProductRecord | null> {
    const row = await this.prisma.client.product.findUnique({
      where: { siteId_kind_externalId: { siteId: runtime.site.id, kind, externalId } },
    });
    return row ? this.productRecord(row) : null;
  }

  private productData(input: ProductInput) {
    return {
      externalId: input.externalId,
      name: input.name,
      description: input.description ?? null,
      imageUrl: input.imageUrl ?? null,
      pointsCost: input.pointsCost,
      cashCost: input.cashCost ?? null,
      stock: input.stock ?? null,
      status: input.status ?? 'on_sale',
      limitPerUser: input.limitPerUser ?? null,
      startAt: input.startAt ? new Date(input.startAt) : null,
      endAt: input.endAt ? new Date(input.endAt) : null,
      raw: input.raw === undefined ? undefined : (input.raw as Prisma.InputJsonValue),
      lastSeenAt: new Date(),
    };
  }

  private async productUpsert(runtime: RunRuntime, kind: ProductKind, input: ProductInput): Promise<ProductRecord> {
    const data = this.productData(input);
    const row = await this.prisma.client.product.upsert({
      where: { siteId_kind_externalId: { siteId: runtime.site.id, kind, externalId: input.externalId } },
      create: { siteId: runtime.site.id, kind, ...data },
      update: data,
    });
    return this.productRecord(row);
  }

  private async productsUpsertMany(runtime: RunRuntime, kind: ProductKind, inputs: ProductInput[]): Promise<ProductRecord[]> {
    const records: ProductRecord[] = [];
    for (const input of inputs) records.push(await this.productUpsert(runtime, kind, input));
    return records;
  }

  private async productsSync(
    runtime: RunRuntime,
    kind: ProductKind,
    inputs: ProductInput[],
    options?: ProductSyncOptions,
  ): Promise<ProductSyncResult> {
    const records = await this.productsUpsertMany(runtime, kind, inputs);
    let deactivated = 0;
    if (options?.deactivateMissing) {
      const externalIds = inputs.map((input) => input.externalId);
      const result = await this.prisma.client.product.updateMany({
        where: {
          siteId: runtime.site.id,
          kind,
          ...(externalIds.length > 0 ? { externalId: { notIn: externalIds } } : {}),
        },
        data: { status: 'off_shelf', lastSeenAt: new Date() },
      });
      deactivated = result.count;
    }
    return { upserted: records.length, deactivated };
  }

  private async productUpdate(
    runtime: RunRuntime,
    kind: ProductKind,
    externalId: string,
    patch: Partial<ProductInput>,
  ): Promise<ProductRecord> {
    const existing = await this.prisma.client.product.findUnique({
      where: { siteId_kind_externalId: { siteId: runtime.site.id, kind, externalId } },
    });
    if (!existing) throw Object.assign(new Error('商品不存在'), { code: 'product_not_found' });
    const data: Record<string, unknown> = { lastSeenAt: new Date() };
    for (const key of ['name', 'description', 'imageUrl', 'pointsCost', 'cashCost', 'stock', 'status', 'limitPerUser'] as const) {
      if (patch[key] !== undefined) data[key] = patch[key];
    }
    if (patch.startAt !== undefined) data.startAt = patch.startAt ? new Date(patch.startAt) : null;
    if (patch.endAt !== undefined) data.endAt = patch.endAt ? new Date(patch.endAt) : null;
    if (patch.raw !== undefined) data.raw = patch.raw as Prisma.InputJsonValue;
    const row = await this.prisma.client.product.update({ where: { id: existing.id }, data });
    return this.productRecord(row);
  }

  private async productRemove(runtime: RunRuntime, kind: ProductKind, externalId: string): Promise<boolean> {
    const result = await this.prisma.client.product.deleteMany({
      where: { siteId: runtime.site.id, kind, externalId },
    });
    return result.count > 0;
  }

  // ── points ─────────────────────────────────────────────────────────

  private async ensurePointAccount(runtime: RunRuntime) {
    return this.prisma.client.pointAccount.upsert({
      where: { siteAccountId: runtime.account.id },
      create: { siteAccountId: runtime.account.id },
      update: {},
    });
  }

  private pointsSnapshot(account: any) {
    return {
      balance: account.balance,
      currency: account.currency,
      expiringAmount: account.expiringAmount,
      nextExpiryAt: account.nextExpiryAt?.toISOString() ?? null,
      rulesText: account.rulesText,
      estimated: account.estimated,
      lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
    };
  }

  private async pointsGet(runtime: RunRuntime) {
    const account = await this.prisma.client.pointAccount.findUnique({
      where: { siteAccountId: runtime.account.id },
    });
    return account ? this.pointsSnapshot(account) : null;
  }

  private async pointsSync(runtime: RunRuntime, snapshot: Record<string, unknown>) {
    const account = await this.ensurePointAccount(runtime);
    const updated = await this.prisma.client.pointAccount.update({
      where: { id: account.id },
      data: {
        ...(snapshot.balance !== undefined ? { balance: Number(snapshot.balance) } : {}),
        ...(snapshot.currency !== undefined ? { currency: String(snapshot.currency) } : {}),
        ...(snapshot.expiringAmount !== undefined ? { expiringAmount: Number(snapshot.expiringAmount) } : {}),
        ...(snapshot.nextExpiryAt !== undefined
          ? { nextExpiryAt: snapshot.nextExpiryAt ? new Date(String(snapshot.nextExpiryAt)) : null }
          : {}),
        ...(snapshot.rulesText !== undefined ? { rulesText: String(snapshot.rulesText) } : {}),
        ...(snapshot.estimated !== undefined ? { estimated: Boolean(snapshot.estimated) } : {}),
        lastSyncedAt: new Date(),
      },
    });
    return this.pointsSnapshot(updated);
  }

  private async pointsAdd(
    runtime: RunRuntime,
    delta: number,
    input?: Omit<PointTransactionInput, 'amount' | 'balanceAfter'>,
  ) {
    const account = await this.ensurePointAccount(runtime);
    const balanceAfter = account.balance + delta;
    if (balanceAfter < 0) throw Object.assign(new Error('积分不足'), { code: 'insufficient_points' });
    const updated = await this.prisma.client.pointAccount.update({
      where: { id: account.id },
      data: { balance: balanceAfter, lastSyncedAt: new Date() },
    });
    await this.prisma.client.pointTransaction.create({
      data: {
        pointAccountId: account.id,
        type: input?.type ?? (delta >= 0 ? 'earn' : 'spend'),
        amount: Math.abs(delta),
        balanceAfter,
        occurredAt: input?.occurredAt ? new Date(input.occurredAt) : new Date(),
        referenceType: input?.referenceType,
        referenceId: input?.referenceId,
        description: input?.description,
        raw: input?.raw as Prisma.InputJsonValue | undefined,
      },
    });
    return this.pointsSnapshot(updated);
  }

  private async pointsAddLot(runtime: RunRuntime, input: PointLotInput) {
    const account = await this.ensurePointAccount(runtime);
    const lot = await this.prisma.client.pointLot.create({
      data: {
        pointAccountId: account.id,
        amount: input.amount,
        remaining: input.amount,
        grantedAt: input.grantedAt ? new Date(input.grantedAt) : new Date(),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        source: input.source ?? 'unknown',
        sourceRef: input.sourceRef,
        estimated: Boolean(input.estimated),
      },
    });
    return {
      id: lot.id,
      amount: lot.amount,
      remaining: lot.remaining,
      grantedAt: lot.grantedAt.toISOString(),
      expiresAt: lot.expiresAt?.toISOString() ?? null,
      source: lot.source,
      sourceRef: lot.sourceRef,
      estimated: lot.estimated,
    };
  }

  private async pointsTransactions(runtime: RunRuntime, options?: { limit?: number }) {
    const account = await this.prisma.client.pointAccount.findUnique({
      where: { siteAccountId: runtime.account.id },
    });
    if (!account) return [];
    const rows = await this.prisma.client.pointTransaction.findMany({
      where: { pointAccountId: account.id },
      orderBy: { occurredAt: 'desc' },
      take: options?.limit ?? 50,
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      amount: row.amount,
      balanceAfter: row.balanceAfter,
      occurredAt: row.occurredAt.toISOString(),
      referenceType: row.referenceType ?? undefined,
      referenceId: row.referenceId ?? undefined,
      description: row.description ?? undefined,
      raw: row.raw,
    }));
  }

  private async pointsLots(runtime: RunRuntime) {
    const account = await this.prisma.client.pointAccount.findUnique({
      where: { siteAccountId: runtime.account.id },
    });
    if (!account) return [];
    const rows = await this.prisma.client.pointLot.findMany({
      where: { pointAccountId: account.id },
      orderBy: { grantedAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      amount: row.amount,
      remaining: row.remaining,
      grantedAt: row.grantedAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      source: row.source,
      sourceRef: row.sourceRef ?? undefined,
      estimated: row.estimated,
    }));
  }

  // ── activities ─────────────────────────────────────────────────────

  private activityRecord(row: any) {
    return {
      id: row.id,
      externalId: row.externalId,
      name: row.name,
      type: row.type,
      points: row.points,
      status: row.status,
      progressCurrent: row.progressCurrent,
      progressTarget: row.progressTarget,
      startAt: row.startAt?.toISOString() ?? null,
      endAt: row.endAt?.toISOString() ?? null,
      action: row.action,
      formSchema: row.formSchema ?? null,
      scriptId: row.scriptId ?? null,
      raw: row.raw,
      lastSyncedAt: row.lastSyncedAt?.toISOString(),
    };
  }

  private async activitiesList(runtime: RunRuntime, options?: { status?: string; limit?: number }) {
    const rows = await this.prisma.client.activity.findMany({
      where: { siteId: runtime.site.id, ...(options?.status ? { status: options.status } : {}) },
      orderBy: { lastSyncedAt: 'desc' },
      take: options?.limit ?? 100,
    });
    return rows.map((row) => this.activityRecord(row));
  }

  private async activityGet(runtime: RunRuntime, externalId: string) {
    const row = await this.prisma.client.activity.findUnique({
      where: { siteId_externalId: { siteId: runtime.site.id, externalId } },
    });
    return row ? this.activityRecord(row) : null;
  }

  private async activityUpsert(runtime: RunRuntime, input: ActivityInput) {
    const data = {
      name: input.name,
      type: input.type ?? 'task',
      points: input.points ?? null,
      status: input.status ?? 'available',
      progressCurrent: input.progressCurrent ?? null,
      progressTarget: input.progressTarget ?? null,
      startAt: input.startAt ? new Date(input.startAt) : null,
      endAt: input.endAt ? new Date(input.endAt) : null,
      action: input.action ?? 'none',
      raw: input.raw as Prisma.InputJsonValue | undefined,
      lastSyncedAt: new Date(),
    };
    const formSchema =
      input.formSchema === undefined
        ? undefined
        : input.formSchema === null
          ? Prisma.DbNull
          : (input.formSchema as unknown as Prisma.InputJsonValue);
    const scriptId = input.formSchema ? runtime.siteScript?.id ?? null : null;
    const row = await this.prisma.client.activity.upsert({
      where: { siteId_externalId: { siteId: runtime.site.id, externalId: input.externalId } },
      create: {
        siteId: runtime.site.id,
        externalId: input.externalId,
        ...data,
        ...(formSchema !== undefined ? { formSchema } : {}),
        ...(scriptId ? { scriptId } : {}),
      },
      update: {
        ...data,
        ...(formSchema !== undefined ? { formSchema, scriptId } : {}),
      },
    });
    return this.activityRecord(row);
  }

  private async activitiesUpsertMany(runtime: RunRuntime, inputs: ActivityInput[]) {
    for (const input of inputs) await this.activityUpsert(runtime, input);
    return inputs.length;
  }

  private async activityProgress(runtime: RunRuntime, externalId: string, current: number, target?: number, status?: string) {
    const existing = await this.prisma.client.activity.findUnique({
      where: { siteId_externalId: { siteId: runtime.site.id, externalId } },
    });
    if (!existing) throw Object.assign(new Error('活动不存在'), { code: 'activity_not_found' });
    const row = await this.prisma.client.activity.update({
      where: { id: existing.id },
      data: {
        progressCurrent: current,
        ...(target !== undefined ? { progressTarget: target } : {}),
        ...(status ? { status } : {}),
        lastSyncedAt: new Date(),
      },
    });
    return this.activityRecord(row);
  }

  // ── orders ─────────────────────────────────────────────────────────

  private orderToRecord(row: any) {
    return {
      id: row.id,
      externalId: row.externalId,
      productExternalId: row.productExternalId,
      capability: row.capability,
      quantity: row.quantity,
      pointsCost: row.pointsCost,
      cashCost: row.cashCost === null || row.cashCost === undefined ? null : Number(row.cashCost),
      status: row.status,
      message: row.message,
      raw: row.raw,
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString(),
    };
  }

  private async orderRecord(runtime: RunRuntime, input: OrderInput) {
    const data = {
      capability: input.capability,
      productExternalId: input.productExternalId,
      quantity: input.quantity,
      pointsCost: input.pointsCost ?? null,
      cashCost: input.cashCost ?? null,
      status: input.status,
      message: input.message,
      raw: input.raw as Prisma.InputJsonValue | undefined,
    };
    if (input.externalId) {
      const row = await this.prisma.client.order.upsert({
        where: {
          siteId_siteAccountId_externalId: {
            siteId: runtime.site.id,
            siteAccountId: runtime.account.id,
            externalId: input.externalId,
          },
        },
        create: {
          siteId: runtime.site.id,
          siteAccountId: runtime.account.id,
          externalId: input.externalId,
          ...data,
        },
        update: data,
      });
      return this.orderToRecord(row);
    }
    const row = await this.prisma.client.order.create({
      data: { siteId: runtime.site.id, siteAccountId: runtime.account.id, ...data },
    });
    return this.orderToRecord(row);
  }

  private async orderList(runtime: RunRuntime, options?: { status?: string; limit?: number }) {
    const rows = await this.prisma.client.order.findMany({
      where: {
        siteId: runtime.site.id,
        siteAccountId: runtime.account.id,
        ...(options?.status ? { status: options.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 50,
    });
    return rows.map((row) => this.orderToRecord(row));
  }

  private async orderUpdate(runtime: RunRuntime, idOrExternalId: string, patch: Partial<OrderInput>) {
    const row = await this.prisma.client.order.findFirst({
      where: {
        siteId: runtime.site.id,
        siteAccountId: runtime.account.id,
        OR: [{ id: idOrExternalId }, { externalId: idOrExternalId }],
      },
    });
    if (!row) throw Object.assign(new Error('订单不存在'), { code: 'order_not_found' });
    const updated = await this.prisma.client.order.update({
      where: { id: row.id },
      data: {
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.message !== undefined ? { message: patch.message } : {}),
        ...(patch.raw !== undefined ? { raw: patch.raw as Prisma.InputJsonValue } : {}),
      },
    });
    return this.orderToRecord(updated);
  }

  // ── notify / artifacts ─────────────────────────────────────────────

  private async notifyFailure(runtime: RunRuntime, message: string): Promise<void> {
    try {
      await this.notify(runtime, {
        title: `${runtime.site.name} · ${runtime.runInfo.script.name} 运行失败`,
        body: message,
        level: 'error',
        data: { runId: runtime.runId },
      });
    } catch (error) {
      console.error('run failure notification failed', error);
    }
  }

  private async notify(
    runtime: RunRuntime,
    options: { title?: string; body: string; level?: string; data?: unknown },
  ): Promise<void> {
    const title = options.title ?? `${runtime.site.name} · 脚本通知`;
    const row = await this.prisma.client.notification.create({
      data: {
        channel: 'app',
        eventType: `script.${options.level ?? 'info'}`,
        title,
        body: options.body,
        payload: options.data === undefined ? undefined : (JSON.parse(JSON.stringify(options.data)) as Prisma.InputJsonValue),
        status: 'pending',
      },
    });

    const token = await this.setting('notify.serverchanToken', 'SERVERCHAN_TOKEN');
    if (!token) return;
    try {
      const response = await fetch(`https://sctapi.ftqq.com/${token}.send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ title, desp: options.body }),
      });
      await this.prisma.client.notification.update({
        where: { id: row.id },
        data: response.ok
          ? { status: 'sent', sentAt: new Date(), channel: 'serverchan' }
          : { status: 'failed', error: `HTTP ${response.status}` },
      });
    } catch (error) {
      await this.prisma.client.notification.update({
        where: { id: row.id },
        data: { status: 'failed', error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  private async artifactWrite(
    runtime: RunRuntime,
    name: string,
    content: string,
    encoding: 'utf8' | 'base64',
  ) {
    if (!name || name.includes('..') || isAbsolute(name)) {
      throw Object.assign(new Error('产物路径不合法'), { code: 'invalid_artifact_path' });
    }
    const dir = resolve(dataRoot(), 'artifacts', runtime.runId);
    const full = safeJoin(dir, name);
    await mkdir(dirname(full), { recursive: true });
    const buffer = encoding === 'base64' ? Buffer.from(content, 'base64') : Buffer.from(content, 'utf8');
    await writeFile(full, buffer);
    return { path: `artifacts/${runtime.runId}/${name}`, bytes: buffer.length };
  }
}
