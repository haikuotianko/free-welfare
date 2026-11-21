import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AppError } from '../../common/app-error';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  list() {
    return this.prisma.client.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async test(title: string, body: string) {
    const token = await this.settings.getServerchanToken();
    if (!token) throw new AppError('system_error', '请先配置 Server酱 token', 400);

    const response = await fetch(`https://sctapi.ftqq.com/${token}.send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ title, desp: body }),
    });
    const result = (await response.json().catch(() => null)) as { code?: number } | null;
    const ok = response.ok && (result?.code === 0 || result?.code === undefined);
    await this.prisma.client.notification.create({
      data: {
        channel: 'serverchan',
        eventType: 'test',
        title,
        body,
        payload: result ?? undefined,
        status: ok ? 'sent' : 'failed',
        error: ok ? null : JSON.stringify(result),
        sentAt: ok ? new Date() : null,
      },
    });
    if (!ok) throw new AppError('system_error', 'Server酱发送失败', 502);
    return { ok: true };
  }
}
