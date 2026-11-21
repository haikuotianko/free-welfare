import { Injectable } from '@nestjs/common';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { Prisma } from '@free-welfare/db';
import { DEFAULT_TIMEZONE } from '@free-welfare/shared';
import { PrismaService } from '../../database/prisma.service';
import { AppError } from '../../common/app-error';
import { siteDir } from '../../common/app-data';
import { QueueService } from '../queue/queue.service';

const ALLOWED_EXTENSIONS = /\.(js|ts|mjs|cjs|json|md|txt)$/i;
const MAX_FILE_BYTES = 512 * 1024;

export interface SiteScriptInput {
  name: string;
  description?: string;
  filePath: string;
  args?: string;
  cron?: string;
  timezone?: string;
  capabilities?: string[];
  enabled?: boolean;
}

function normalizeFilePath(input: string): string {
  const value = String(input ?? '').replace(/\\/g, '/').trim();
  if (!value || value.startsWith('/') || value.includes('\0') || value.includes('..')) {
    throw new AppError('validation_failed', '脚本文件路径不合法', 400);
  }
  if (!ALLOWED_EXTENSIONS.test(value)) {
    throw new AppError('validation_failed', '只允许 js/ts/mjs/cjs/json/md/txt 文件', 400);
  }
  return value;
}

@Injectable()
export class SiteScriptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  list(siteId: string) {
    return this.prisma.client.siteScript.findMany({
      where: { siteId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(siteId: string, input: SiteScriptInput) {
    const site = await this.getSite(siteId);
    normalizeFilePath(input.filePath);
    const script = await this.prisma.client.siteScript.create({
      data: {
        siteId: site.id,
        name: input.name,
        description: input.description ?? '',
        filePath: input.filePath,
        args: input.args ?? '',
        cron: input.cron ?? '',
        timezone: input.timezone ?? DEFAULT_TIMEZONE,
        capabilities: input.capabilities ?? [],
        enabled: input.enabled ?? true,
      },
    });
    await this.recomputeCapabilities(siteId);
    return script;
  }

  async update(siteId: string, scriptId: string, input: Partial<SiteScriptInput>) {
    await this.getSite(siteId);
    const existing = await this.prisma.client.siteScript.findFirst({
      where: { id: scriptId, siteId },
    });
    if (!existing) throw new AppError('not_found', '脚本不存在', 404);
    if (input.filePath !== undefined) normalizeFilePath(input.filePath);

    const data: Prisma.SiteScriptUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.filePath !== undefined) data.filePath = input.filePath;
    if (input.args !== undefined) data.args = input.args;
    if (input.cron !== undefined) {
      data.cron = input.cron;
      data.nextRunAt = null;
    }
    if (input.timezone !== undefined) {
      data.timezone = input.timezone;
      data.nextRunAt = null;
    }
    if (input.capabilities !== undefined) data.capabilities = input.capabilities;
    if (input.enabled !== undefined) data.enabled = input.enabled;

    const script = await this.prisma.client.siteScript.update({ where: { id: scriptId }, data });
    await this.recomputeCapabilities(siteId);
    return script;
  }

  async remove(siteId: string, scriptId: string) {
    const deleted = await this.prisma.client.siteScript.deleteMany({
      where: { id: scriptId, siteId },
    });
    if (deleted.count === 0) throw new AppError('not_found', '脚本不存在', 404);
    await this.recomputeCapabilities(siteId);
    return { ok: true };
  }

  async run(siteId: string, scriptId: string, accountId?: string) {
    await this.getSite(siteId);
    const script = await this.prisma.client.siteScript.findFirst({
      where: { id: scriptId, siteId },
    });
    if (!script) throw new AppError('not_found', '脚本不存在', 404);
    if (!script.enabled) throw new AppError('script_disabled', '脚本已停用', 400);

    let account;
    if (accountId) {
      account = await this.prisma.client.siteAccount.findFirst({
        where: { id: accountId, siteId },
      });
      if (!account) throw new AppError('not_found', '该应用下没有这个账号', 404);
    } else {
      const accounts = await this.prisma.client.siteAccount.findMany({
        where: { siteId, disabled: false },
        take: 2,
        orderBy: { createdAt: 'asc' },
      });
      if (accounts.length === 0) {
        throw new AppError('account_required', '请先为应用绑定微信账号', 400);
      }
      if (accounts.length > 1) {
        throw new AppError('account_required', '应用下有多个账号，请指定要运行的账号', 400);
      }
      account = accounts[0];
    }

    return this.queue.enqueue({
      siteScriptId: script.id,
      siteId,
      siteAccountId: account.id,
    });
  }

  async listFiles(siteId: string) {
    const site = await this.getSite(siteId);
    const dir = await this.ensureScriptDir(site.key);
    const files = await this.walk(dir, dir, 0);
    return { files, dir: site.key };
  }

  async readFile(siteId: string, filePath: string) {
    const site = await this.getSite(siteId);
    const dir = await this.ensureScriptDir(site.key);
    const full = this.resolveInside(dir, normalizeFilePath(filePath));
    let info;
    try {
      info = await stat(full);
    } catch {
      throw new AppError('not_found', '脚本文件不存在', 404);
    }
    if (!info.isFile()) throw new AppError('not_found', '脚本文件不存在', 404);
    if (info.size > MAX_FILE_BYTES) throw new AppError('validation_failed', '脚本文件过大', 400);
    return { path: normalizeFilePath(filePath), content: await readFile(full, 'utf8') };
  }

  async writeFile(siteId: string, filePath: string, content: string) {
    const site = await this.getSite(siteId);
    const normalized = normalizeFilePath(filePath);
    if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) {
      throw new AppError('validation_failed', '脚本文件过大（最大 512KB）', 400);
    }
    const dir = await this.ensureScriptDir(site.key);
    const full = this.resolveInside(dir, normalized);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content, 'utf8');
    return { ok: true, path: normalized };
  }

  async deleteFile(siteId: string, filePath: string) {
    const site = await this.getSite(siteId);
    const normalized = normalizeFilePath(filePath);
    const dir = await this.ensureScriptDir(site.key);
    const full = this.resolveInside(dir, normalized);
    try {
      await unlink(full);
    } catch {
      throw new AppError('not_found', '脚本文件不存在', 404);
    }
    return { ok: true, path: normalized };
  }

  private async getSite(siteId: string) {
    const site = await this.prisma.client.site.findUnique({ where: { id: siteId } });
    if (!site) throw new AppError('not_found', '应用不存在', 404);
    return site;
  }

  private async ensureScriptDir(siteKey: string): Promise<string> {
    const dir = resolve(siteDir(siteKey), 'scripts');
    await mkdir(dir, { recursive: true });
    return dir;
  }

  private resolveInside(dir: string, filePath: string): string {
    const full = resolve(dir, filePath);
    if (full !== dir && !full.startsWith(dir + sep)) {
      throw new AppError('validation_failed', '脚本文件路径不合法', 400);
    }
    return full;
  }

  private async walk(root: string, dir: string, depth: number): Promise<Array<{ path: string; size: number; updatedAt: string }>> {
    if (depth > 3) return [];
    const entries = await readdir(dir, { withFileTypes: true });
    const files: Array<{ path: string; size: number; updatedAt: string }> = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await this.walk(root, full, depth + 1)));
      } else if (entry.isFile() && ALLOWED_EXTENSIONS.test(entry.name)) {
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

  private async recomputeCapabilities(siteId: string) {
    const scripts = await this.prisma.client.siteScript.findMany({
      where: { siteId, enabled: true },
      select: { capabilities: true },
    });
    const capabilities = [...new Set(scripts.flatMap((script) => script.capabilities))].sort();
    await this.prisma.client.site.update({ where: { id: siteId }, data: { capabilities } });
  }
}
