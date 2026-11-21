import { Injectable } from '@nestjs/common';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type { Prisma } from '@free-welfare/db';
import type {
  NetworkConfigInput,
  SiteCreateInput,
  SiteEnvVarInput,
  SiteUpdateInput,
} from '@free-welfare/shared';
import { PrismaService } from '../../database/prisma.service';
import { AppError } from '../../common/app-error';
import { SecurityService } from '../../common/security.service';
import { siteDir } from '../../common/app-data';
import { QueueService } from '../queue/queue.service';

const ICON_EXTENSIONS = /\.(png|jpe?g|webp|gif|svg|ico)$/i;
const ICON_MAX_BYTES = 512 * 1024;
const ICON_FILE_MAX_BYTES = 2 * 1024 * 1024;
const ICON_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
};
const UPLOAD_MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
};

function normalizeIconPath(input: string): string {
  const value = String(input ?? '').replace(/\\/g, '/').trim();
  if (
    !value ||
    value.startsWith('/') ||
    value.includes('\0') ||
    value.split('/').some((part) => part === '..') ||
    !ICON_EXTENSIONS.test(value)
  ) {
    throw new AppError('validation_failed', '图标路径不合法', 400);
  }
  return value;
}

function iconMimeFor(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop() ?? '';
  return ICON_MIME[ext] ?? 'application/octet-stream';
}

@Injectable()
export class SitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityService,
    private readonly queue: QueueService,
  ) {}

  list() {
    return this.prisma.client.site.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { siteAccounts: true, bindings: true } },
        scripts: { select: { capabilities: true } },
        source: { select: { id: true, name: true, trustLevel: true, indexUrl: true } },
      },
    });
  }

  async get(id: string) {
    const site = await this.prisma.client.site.findUnique({
      where: { id },
      include: {
        siteAccounts: {
          include: { wechatAccount: true, pointAccount: true },
        },
        bindings: {
          include: {
            script: true,
            siteAccount: { include: { wechatAccount: true } },
          },
        },
        scripts: { orderBy: { createdAt: 'asc' } },
        source: { select: { id: true, name: true, trustLevel: true, indexUrl: true } },
      },
    });
    if (!site) throw new AppError('not_found', '应用不存在', 404);
    return site;
  }

  create(input: SiteCreateInput) {
    return this.prisma.client.site.create({
      data: {
        key: input.key,
        name: input.name,
        platform: input.platform,
        appId: input.appId,
        iconUrl: input.iconUrl || null,
        description: input.description,
        pointsName: input.pointsName,
        scriptMode: input.scriptMode,
        runTimeoutMinutes: input.runTimeoutMinutes ?? null,
        registrationMode: input.registrationMode,
        registrationNote: input.registrationNote,
        config: input.config as Prisma.InputJsonValue,
        capabilities: input.capabilities,
        networkMode: input.network?.mode ?? 'whitelist',
        rootUrls: (input.network?.rootUrls ?? []) as Prisma.InputJsonValue,
        allowedOrigins: input.network?.allowedOrigins ?? [],
        networkNotes: input.network?.notes ?? '',
      },
    });
  }

  async update(id: string, input: SiteUpdateInput) {
    const data: Prisma.SiteUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.platform !== undefined) data.platform = input.platform;
    if (input.appId !== undefined) data.appId = input.appId;
    if (input.iconUrl !== undefined) data.iconUrl = input.iconUrl || null;
    if (input.description !== undefined) data.description = input.description;
    if (input.pointsName !== undefined) data.pointsName = input.pointsName;
    if (input.scriptMode !== undefined) data.scriptMode = input.scriptMode;
    if (input.runTimeoutMinutes !== undefined) {
      data.runTimeoutMinutes = input.runTimeoutMinutes;
    }
    if (input.registrationMode !== undefined) {
      data.registrationMode = input.registrationMode;
    }
    if (input.registrationNote !== undefined) {
      data.registrationNote = input.registrationNote;
    }
    if (input.config !== undefined) data.config = input.config as Prisma.InputJsonValue;
    if (input.capabilities !== undefined) data.capabilities = input.capabilities;
    if (input.network !== undefined) this.applyNetwork(data, input.network);
    return this.prisma.client.site.update({ where: { id }, data });
  }

  async updateNetwork(id: string, network: NetworkConfigInput) {
    const data: Prisma.SiteUpdateInput = {};
    this.applyNetwork(data, network);
    return this.prisma.client.site.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.prisma.client.site.delete({ where: { id } });
    return { ok: true };
  }

  async bindAccount(siteId: string, wechatAccountId: string) {
    await this.getSiteRow(siteId);
    const account = await this.prisma.client.wechatAccount.findUnique({
      where: { id: wechatAccountId },
    });
    if (!account) throw new AppError('not_found', '微信账号不存在', 404);
    return this.prisma.client.siteAccount.upsert({
      where: { siteId_wechatAccountId: { siteId, wechatAccountId } },
      create: { siteId, wechatAccountId },
      update: {},
      include: { wechatAccount: true, pointAccount: true },
    });
  }

  async unbindAccount(siteId: string, accountId: string) {
    const deleted = await this.prisma.client.siteAccount.deleteMany({
      where: { id: accountId, siteId },
    });
    if (deleted.count === 0) throw new AppError('not_found', '应用账号不存在', 404);
    return { ok: true };
  }

  async updateAccountBinding(
    siteId: string,
    accountId: string,
    input: { disabled?: boolean; envVars?: Record<string, string> },
  ) {
    const data: { disabled?: boolean; envVars?: Record<string, string> } = {};
    if (input.disabled !== undefined) data.disabled = input.disabled;
    if (input.envVars !== undefined) data.envVars = input.envVars;
    const updated = await this.prisma.client.siteAccount.updateMany({
      where: { id: accountId, siteId },
      data,
    });
    if (updated.count === 0) throw new AppError('not_found', '应用账号不存在', 404);
    return this.prisma.client.siteAccount.findUnique({
      where: { id: accountId },
      include: { wechatAccount: true, pointAccount: true },
    });
  }

  async refreshAccountStatus(siteId: string, accountId: string) {
    const account = await this.prisma.client.siteAccount.findFirst({
      where: { id: accountId, siteId },
      select: { id: true },
    });
    if (!account) throw new AppError('not_found', '应用账号不存在', 404);

    const script = await this.prisma.client.siteScript.findFirst({
      where: {
        siteId,
        enabled: true,
        OR: [{ capabilities: { has: 'sign_in' } }, { filePath: 'sign-in.js' }],
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
    });
    if (!script) throw new AppError('script_not_found', '该应用没有可用的签到脚本', 400);

    const active = await this.prisma.client.run.findFirst({
      where: {
        siteScriptId: script.id,
        siteAccountId: account.id,
        status: { in: ['queued', 'starting', 'running'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true },
    });
    if (active) return { ...active, scriptName: script.name, reused: true };

    const run = await this.queue.enqueue({
      siteScriptId: script.id,
      siteId,
      siteAccountId: account.id,
    });
    return { ...run, scriptName: script.name, reused: false };
  }

  async listIconFiles(id: string) {
    const site = await this.getSiteRow(id);
    const dir = siteDir(site.key);
    await mkdir(dir, { recursive: true });
    return { files: await this.walkIconFiles(dir, dir, 0) };
  }

  async readIcon(id: string, requestedPath?: string) {
    const site = await this.getSiteRow(id);
    const value = String(requestedPath ?? site.iconUrl ?? '').trim();
    if (!value || /^https?:\/\//i.test(value)) {
      throw new AppError('not_found', '图标不存在', 404);
    }
    const relative = normalizeIconPath(value);
    const full = this.resolveInside(siteDir(site.key), relative);
    let info;
    try {
      info = await stat(full);
    } catch {
      throw new AppError('not_found', '图标不存在', 404);
    }
    if (!info.isFile() || info.size > ICON_FILE_MAX_BYTES) {
      throw new AppError('not_found', '图标不存在', 404);
    }
    return { data: await readFile(full), contentType: iconMimeFor(relative) };
  }

  async uploadIcon(id: string, dataUrl: string) {
    const site = await this.getSiteRow(id);
    const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
    if (!match) throw new AppError('validation_failed', '图标内容不合法', 400);
    const ext = UPLOAD_MIME_EXT[match[1].toLowerCase()];
    if (!ext) throw new AppError('validation_failed', '只支持 png/jpg/webp/gif/svg/ico 图标', 400);

    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length === 0 || buffer.length > ICON_MAX_BYTES) {
      throw new AppError('validation_failed', '图标不能超过 512KB', 400);
    }

    const iconsDir = resolve(siteDir(site.key), 'icons');
    await mkdir(iconsDir, { recursive: true });
    const fileName = `icon-${Date.now()}.${ext}`;
    const target = this.resolveInside(iconsDir, fileName);
    await writeFile(target, buffer);

    const updated = await this.prisma.client.site.update({
      where: { id },
      data: { iconUrl: `icons/${fileName}` },
    });

    if (site.iconUrl?.startsWith('icons/')) {
      try {
        const old = this.resolveInside(siteDir(site.key), site.iconUrl);
        if (old !== target) await unlink(old);
      } catch {
        // ignore cleanup errors
      }
    }

    return updated;
  }

  async listEnv(id: string) {
    await this.getSiteRow(id);
    const rows = await this.prisma.client.siteEnvVar.findMany({
      where: { siteId: id },
      orderBy: { key: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      key: row.key,
      value: this.security.decrypt(row.valueEnc),
      secret: row.secret,
      description: row.description,
      enabled: row.enabled,
      updatedAt: row.updatedAt,
    }));
  }

  async updateEnv(id: string, input: SiteEnvVarInput[]) {
    await this.getSiteRow(id);
    const vars = [...new Map(input.map((item) => [item.key, item])).values()];
    const keys = vars.map((item) => item.key);

    await this.prisma.client.$transaction(async (tx) => {
      await tx.siteEnvVar.deleteMany({
        where: keys.length > 0 ? { siteId: id, key: { notIn: keys } } : { siteId: id },
      });
      for (const item of vars) {
        await tx.siteEnvVar.upsert({
          where: { siteId_key: { siteId: id, key: item.key } },
          create: {
            siteId: id,
            key: item.key,
            valueEnc: this.security.encrypt(item.value),
            secret: item.secret,
            description: item.description,
            enabled: item.enabled,
          },
          update: {
            valueEnc: this.security.encrypt(item.value),
            secret: item.secret,
            description: item.description,
            enabled: item.enabled,
          },
        });
      }
    });

    return this.listEnv(id);
  }

  private async getSiteRow(id: string) {
    const site = await this.prisma.client.site.findUnique({
      where: { id },
      select: { id: true, key: true, iconUrl: true },
    });
    if (!site) throw new AppError('not_found', '应用不存在', 404);
    return site;
  }

  private async walkIconFiles(
    root: string,
    dir: string,
    depth: number,
  ): Promise<Array<{ path: string; size: number; updatedAt: string }>> {
    if (depth > 4) return [];
    const entries = await readdir(dir, { withFileTypes: true });
    const files: Array<{ path: string; size: number; updatedAt: string }> = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await this.walkIconFiles(root, full, depth + 1)));
      } else if (entry.isFile() && ICON_EXTENSIONS.test(entry.name)) {
        const info = await stat(full);
        files.push({
          path: full.slice(root.length + 1).replace(/\\/g, '/'),
          size: info.size,
          updatedAt: info.mtime.toISOString(),
        });
      }
    }
    return files.sort((a, b) => a.path.localeCompare(b.path));
  }

  private resolveInside(dir: string, filePath: string): string {
    const full = resolve(dir, filePath);
    if (full !== dir && !full.startsWith(dir + sep)) {
      throw new AppError('validation_failed', '路径不合法', 400);
    }
    return full;
  }

  private applyNetwork(data: Prisma.SiteUpdateInput, network: NetworkConfigInput) {
    data.networkMode = network.mode;
    data.rootUrls = network.rootUrls as Prisma.InputJsonValue;
    data.allowedOrigins = network.allowedOrigins;
    data.networkNotes = network.notes;
  }
}
