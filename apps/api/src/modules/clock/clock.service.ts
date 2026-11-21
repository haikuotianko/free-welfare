import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@free-welfare/db';
import {
  CLOCK_SETTING_KEY,
  CLOCK_TIMEZONE,
  defaultClockState,
  parseRemoteTime,
  platformNow,
  readClockState,
  type ClockState,
} from '@free-welfare/domain';
import { PrismaService } from '../../database/prisma.service';
import { AppError } from '../../common/app-error';

export interface ClockUpdateInput {
  mode?: 'auto' | 'manual';
  sourceUrl?: string;
  syncIntervalSeconds?: number;
  manualTime?: string;
}

@Injectable()
export class ClockService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private syncing = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.ensureAutoSync().catch(() => undefined);
    }, 60_000);
    this.timer.unref?.();
    void this.ensureAutoSync().catch(() => undefined);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async getPublic() {
    const state = await this.loadState();
    void this.ensureAutoSync().catch(() => undefined);
    const now = platformNow(state.offsetMs);
    const [upcoming, running, starting, queued] = await Promise.all([
      this.upcoming(now),
      this.prisma.client.run.count({ where: { status: 'running' } }),
      this.prisma.client.run.count({ where: { status: 'starting' } }),
      this.prisma.client.run.count({ where: { status: 'queued' } }),
    ]);
    return {
      ...state,
      serverNow: new Date().toISOString(),
      now: now.toISOString(),
      timezone: CLOCK_TIMEZONE,
      upcoming,
      active: { running: running + starting, starting, queued },
    };
  }

  async update(input: ClockUpdateInput) {
    const state = await this.loadState();
    let resetSchedules = false;

    if (input.sourceUrl !== undefined) {
      const url = input.sourceUrl.trim();
      if (url && !/^https?:\/\//i.test(url)) {
        throw new AppError('validation_failed', '时间同步地址只支持 http(s)', 400);
      }
      state.sourceUrl = url;
    }
    if (input.syncIntervalSeconds !== undefined) {
      state.syncIntervalSeconds = Math.max(30, Math.trunc(input.syncIntervalSeconds));
    }
    if (input.mode !== undefined && input.mode !== state.mode) {
      state.mode = input.mode;
      resetSchedules = true;
    }
    if (input.manualTime !== undefined) {
      const date = new Date(input.manualTime);
      if (Number.isNaN(date.getTime())) {
        throw new AppError('validation_failed', '手动时间不合法', 400);
      }
      state.mode = 'manual';
      state.offsetMs = date.getTime() - Date.now();
      state.manualTime = date.toISOString();
      state.lastSyncedAt = new Date().toISOString();
      state.lastAttemptAt = state.lastSyncedAt;
      state.lastRemoteTime = null;
      state.lastError = null;
      resetSchedules = true;
    } else if (input.mode === 'manual') {
      state.manualTime = platformNow(state.offsetMs).toISOString();
      resetSchedules = true;
    }

    await this.saveState(state);
    if (resetSchedules) await this.resetSchedules();
    return this.getPublic();
  }

  async syncNow() {
    const state = await this.loadState();
    if (!state.sourceUrl) {
      throw new AppError('validation_failed', '请先填写时间同步地址', 400);
    }

    const started = Date.now();
    try {
      const response = await fetch(state.sourceUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(10_000),
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Cache-Control': 'no-cache',
        },
      });
      const text = await response.text();
      const ended = Date.now();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const remote = parseRemoteTime(text, response.headers.get('date'));
      if (!remote) throw new Error('响应里没有可识别的时间');

      const nextOffset =
        remote.getTime() + Math.round((ended - started) / 2) - ended;
      const diff = Math.abs(nextOffset - state.offsetMs);

      state.mode = 'auto';
      state.offsetMs = nextOffset;
      state.lastSyncedAt = new Date(ended).toISOString();
      state.lastAttemptAt = state.lastSyncedAt;
      state.lastRemoteTime = remote.toISOString();
      state.manualTime = null;
      state.lastError = null;
      await this.saveState(state);
      if (diff > 60_000) await this.resetSchedules();
      return this.getPublic();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.lastError = message;
      state.lastAttemptAt = new Date().toISOString();
      await this.saveState(state);
      throw new AppError('clock_sync_failed', `时间同步失败：${message}`, 502);
    }
  }

  private async upcoming(now: Date) {
    const rows = await this.prisma.client.siteScript.findMany({
      where: {
        enabled: true,
        cron: { not: '' },
        nextRunAt: { not: null },
      },
      orderBy: { nextRunAt: 'asc' },
      take: 30,
      include: {
        site: {
          select: {
            id: true,
            key: true,
            name: true,
            iconUrl: true,
            pointsName: true,
          },
        },
      },
    });

    return rows
      .filter((row) => row.nextRunAt)
      .map((row) => ({
        siteId: row.siteId,
        siteKey: row.site.key,
        siteName: row.site.name,
        siteIconUrl: row.site.iconUrl,
        pointsName: row.site.pointsName,
        scriptId: row.id,
        scriptName: row.name,
        nextRunAt: row.nextRunAt!.toISOString(),
        secondsLeft: Math.max(
          0,
          Math.floor((row.nextRunAt!.getTime() - now.getTime()) / 1000),
        ),
      }));
  }

  private async ensureAutoSync() {
    if (this.syncing) return;
    const state = await this.loadState();
    if (state.mode !== 'auto' || !state.sourceUrl) return;

    const last = Math.max(
      state.lastSyncedAt ? Date.parse(state.lastSyncedAt) : 0,
      state.lastAttemptAt ? Date.parse(state.lastAttemptAt) : 0,
    );
    if (Date.now() - last < state.syncIntervalSeconds * 1000) return;

    this.syncing = true;
    try {
      await this.syncNow();
    } catch {
      // lastError is persisted and shown in the UI.
    } finally {
      this.syncing = false;
    }
  }

  private async resetSchedules() {
    await this.prisma.client.siteScript.updateMany({
      where: { enabled: true, cron: { not: '' } },
      data: { nextRunAt: null },
    });
  }

  private async loadState(): Promise<ClockState> {
    const row = await this.prisma.client.setting.findUnique({
      where: { key: CLOCK_SETTING_KEY },
    });
    return row ? readClockState(row.value) : defaultClockState();
  }

  private async saveState(state: ClockState) {
    const value = state as unknown as Prisma.InputJsonValue;
    await this.prisma.client.setting.upsert({
      where: { key: CLOCK_SETTING_KEY },
      create: { key: CLOCK_SETTING_KEY, value, encrypted: false },
      update: { value, encrypted: false },
    });
  }
}
