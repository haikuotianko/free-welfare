import { Injectable } from '@nestjs/common';
import type { Prisma } from '@free-welfare/db';
import { z } from 'zod';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../database/prisma.service';
import { QueueService } from '../queue/queue.service';

export const activityParticipateSchema = z.object({
  accountId: z.string().min(1),
  values: z.record(z.string().max(2000)).default({}),
});

interface ActivityFormField {
  key: string;
  label: string;
  type: string;
  defaultValue: string;
  note: string;
  required: boolean;
  options: string[];
}

function activityFields(raw: unknown): ActivityFormField[] {
  if (!raw || typeof raw !== 'object') return [];
  const fields = Array.isArray((raw as { fields?: unknown }).fields)
    ? ((raw as { fields: unknown[] }).fields)
    : Array.isArray(raw)
      ? raw
      : [];
  return fields.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const field = item as Record<string, unknown>;
    if (typeof field.key !== 'string' || typeof field.label !== 'string') return [];
    return [
      {
        key: field.key,
        label: field.label,
        type: typeof field.type === 'string' ? field.type : 'text',
        defaultValue: typeof field.defaultValue === 'string' ? field.defaultValue : '',
        note: typeof field.note === 'string' ? field.note : '',
        required: Boolean(field.required),
        options: Array.isArray(field.options)
          ? field.options.filter((option): option is string => typeof option === 'string')
          : [],
      },
    ];
  });
}

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  list() {
    return this.prisma.client.activity.findMany({
      orderBy: [{ lastSyncedAt: 'desc' }],
      include: {
        site: {
          select: {
            id: true,
            key: true,
            name: true,
            appId: true,
            iconUrl: true,
            pointsName: true,
            metadata: true,
            config: true,
          },
        },
        script: { select: { id: true, name: true } },
      },
    });
  }

  async participate(id: string, input: z.infer<typeof activityParticipateSchema>) {
    const activity = await this.prisma.client.activity.findUnique({
      where: { id },
      include: { script: true },
    });
    if (!activity) throw new AppError('not_found', '活动不存在', 404);
    if (!activity.scriptId || !activity.script) {
      throw new AppError('activity_not_participable', '该活动没有配置参与脚本', 400);
    }
    if (!activity.script.enabled) {
      throw new AppError('activity_not_participable', '参与脚本已停用', 400);
    }
    if (activity.status === 'expired' || activity.status === 'completed') {
      throw new AppError('activity_not_available', '活动已结束或已完成', 400);
    }

    // 页面传全局微信账号 ID；同时兼容直接传订阅账号（SiteAccount）ID。
    const account = await this.prisma.client.siteAccount.findFirst({
      where: {
        siteId: activity.siteId,
        OR: [{ wechatAccountId: input.accountId }, { id: input.accountId }],
      },
    });
    if (!account) throw new AppError('not_found', '该账号没有订阅这个应用', 404);

    const fields = activityFields(activity.formSchema);
    const values: Record<string, string> = {};
    for (const field of fields) {
      const raw = input.values[field.key];
      const value = raw === undefined || raw === null ? field.defaultValue : String(raw);
      if (field.required && !value.trim()) {
        throw new AppError('validation_failed', `请填写「${field.label}」`, 400);
      }
      values[field.key] = value;
    }

    const run = await this.queue.enqueue({
      siteScriptId: activity.scriptId,
      siteId: activity.siteId,
      siteAccountId: account.id,
      input: {
        source: 'activity',
        activityId: activity.id,
        activityExternalId: activity.externalId,
        activityName: activity.name,
        values,
      } as Prisma.InputJsonValue,
    });

    return { run };
  }
}
