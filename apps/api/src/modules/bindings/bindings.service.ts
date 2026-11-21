import { Injectable } from '@nestjs/common';
import type { Prisma } from '@free-welfare/db';
import { PrismaService } from '../../database/prisma.service';
import { AppError } from '../../common/app-error';

@Injectable()
export class BindingsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.client.binding.findMany({
      orderBy: { createdAt: 'asc' },
      include: { site: true, siteAccount: true, script: true },
    });
  }

  async create(input: {
    siteId: string;
    siteAccountId: string;
    scriptId: string;
    config?: Record<string, unknown>;
  }) {
    const siteAccount = await this.prisma.client.siteAccount.findFirst({
      where: { id: input.siteAccountId, siteId: input.siteId },
    });
    if (!siteAccount) throw new AppError('not_found', '该应用下没有这个账号', 404);
    const script = await this.prisma.client.script.findUnique({ where: { id: input.scriptId } });
    if (!script) throw new AppError('not_found', '脚本不存在', 404);
    if (script.kind !== 'action') throw new AppError('validation_failed', '只能绑定功能脚本', 400);

    return this.prisma.client.binding.create({
      data: {
        siteId: input.siteId,
        siteAccountId: input.siteAccountId,
        scriptId: input.scriptId,
        configEnc: (input.config ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async update(id: string, input: { enabled?: boolean; config?: Record<string, unknown> }) {
    const data: Prisma.BindingUpdateInput = {};
    if (input.enabled !== undefined) data.enabled = input.enabled;
    if (input.config !== undefined) data.configEnc = input.config as Prisma.InputJsonValue;
    return this.prisma.client.binding.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.prisma.client.binding.delete({ where: { id } });
    return { ok: true };
  }
}
