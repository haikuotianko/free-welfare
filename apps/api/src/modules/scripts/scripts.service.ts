import { Injectable } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { z } from 'zod';
import { CAPABILITIES, DEFAULT_TIMEZONE } from '@free-welfare/shared';
import type { Prisma } from '@free-welfare/db';
import { PrismaService } from '../../database/prisma.service';
import { AppError } from '../../common/app-error';
import { readSourceText } from '../../common/source-content';

const indexScriptSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  version: z.string().min(1).max(50),
  kind: z.enum(['action', 'common']).default('action'),
  capability: z.enum(CAPABILITIES).optional(),
  platform: z.string().default('wechat_miniprogram'),
  app_id: z.string().optional(),
  common_version: z.string().optional(),
  review_status: z.enum(['reviewed', 'community', 'custom']).default('community'),
  bundle_url: z.string().min(1),
  sha256: z.string().optional(),
  description: z.string().max(2000).default(''),
  manifest: z.record(z.unknown()).optional(),
  min_platform_version: z.string().optional(),
});

const MAX_INDEX_BYTES = 2 * 1024 * 1024;
const MAX_BUNDLE_BYTES = 2 * 1024 * 1024;

const indexAppScriptSchema = z.object({
  name: z.string().min(1).max(120),
  file_path: z.string().min(1).max(300),
  description: z.string().max(2000).default(''),
  cron: z.string().max(100).default(''),
  timezone: z.string().max(64).default(DEFAULT_TIMEZONE),
  args: z.string().max(500).default(''),
  capabilities: z.array(z.enum(CAPABILITIES)).default([]),
  enabled: z.boolean().default(false),
});

const indexAppEnvSchema = z.object({
  key: z.string().min(1).max(120),
  description: z.string().max(500).default(''),
  secret: z.boolean().default(true),
  enabled: z.boolean().default(true),
});

const indexAppSchema = z.object({
  key: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  appId: z.string().min(1).max(120).optional(),
  app_id: z.string().min(1).max(120).optional(),
  platform: z.string().default('wechat_miniprogram'),
  description: z.string().max(2000).default(''),
  icon_url: z.string().optional(),
  points_name: z.string().max(40).default('积分'),
  category: z.string().max(80).default(''),
  version: z.string().max(50).default(''),
  root_urls: z.array(z.union([z.string(), z.record(z.unknown())])).default([]),
  network_notes: z.string().max(2000).default(''),
  env: z.array(indexAppEnvSchema).default([]),
  scripts: z.array(indexAppScriptSchema).default([]),
  bundle_url: z.string().optional(),
  files: z.record(z.string()).optional(),
});

const indexSchema = z.object({
  schema_version: z.number().optional(),
  generated_at: z.string().optional(),
  scripts: z.array(indexScriptSchema).default([]),
  apps: z.array(indexAppSchema).default([]),
});

function dataRoot(): string {
  if (process.env.DATA_DIR) return resolve(process.env.DATA_DIR);
  const candidates = [resolve(process.cwd(), 'data'), resolve(process.cwd(), '..', '..', 'data')];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

function assertSafeKey(key: string): string {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(key) || key.includes('..')) {
    throw new AppError('validation_failed', '脚本 key 不合法', 400);
  }
  return key;
}

@Injectable()
export class ScriptsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.client.script.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        versions: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
  }

  async get(id: string) {
    const script = await this.prisma.client.script.findUnique({
      where: { id },
      include: { versions: { orderBy: { createdAt: 'desc' } } },
    });
    if (!script) throw new AppError('not_found', '脚本不存在', 404);
    return script;
  }

  sources() {
    return this.prisma.client.scriptSource.findMany({ orderBy: { createdAt: 'asc' } });
  }

  createSource(input: {
    name: string;
    repoUrl: string;
    branch: string;
    indexUrl: string;
    trustLevel: string;
  }) {
    return this.prisma.client.scriptSource.create({ data: input });
  }

  async testSource(indexUrl: string) {
    if (!/^(https?:\/\/|local:\/\/)/i.test(indexUrl)) {
      throw new AppError('validation_failed', '应用源地址只支持 http(s) 或 local://', 400);
    }
    try {
      const text = await readSourceText(indexUrl);
      const bytes = Buffer.byteLength(text, 'utf8');
      if (bytes > MAX_INDEX_BYTES) {
        throw new Error('index.json 超过 2MB');
      }
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        throw new Error('index.json 不是合法 JSON');
      }
      const parsed = indexSchema.parse(raw);
      const appScripts = parsed.apps.reduce(
        (sum, item) => sum + item.scripts.length,
        0,
      );
      return {
        ok: true,
        indexUrl,
        apps: parsed.apps.length,
        scripts: parsed.scripts.length + appScripts,
        topLevelScripts: parsed.scripts.length,
        appScripts,
        generatedAt: parsed.generated_at ?? null,
        bytes,
      };
    } catch (error) {
      const message =
        error instanceof z.ZodError
          ? `index.json 格式不合法：${error.issues[0]?.path.join('.') || ''} ${error.issues[0]?.message || ''}`.trim()
          : error instanceof Error
            ? error.message
            : String(error);
      throw new AppError('source_test_failed', `应用源检测失败：${message}`, 502);
    }
  }

  async syncSource(id: string) {
    const source = await this.prisma.client.scriptSource.findUnique({ where: { id } });
    if (!source) throw new AppError('not_found', '订阅源不存在', 404);

    try {
      const text = await readSourceText(source.indexUrl);
      if (Buffer.byteLength(text, 'utf8') > MAX_INDEX_BYTES) {
        throw new Error('index.json 超过 2MB');
      }
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        throw new Error('index.json 不是合法 JSON');
      }
      const parsed = indexSchema.parse(raw);

      let synced = 0;
      for (const item of parsed.scripts) {
        const key = assertSafeKey(item.id);
        if (!/^local:\/\//i.test(item.bundle_url)) {
          let resolved: URL;
          try {
            resolved = new URL(item.bundle_url, source.indexUrl);
          } catch {
            throw new Error(`bundle_url 不是合法地址：${item.id}`);
          }
          if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
            throw new Error(`bundle_url 只支持 http(s) 或 local://：${item.id}`);
          }
        }
        const existingScript = await this.prisma.client.script.findUnique({ where: { key } });
        const script = existingScript
          ? await this.prisma.client.script.update({
              where: { id: existingScript.id },
              data: {
                name: item.name,
                description: item.description,
                kind: item.kind,
                capability: item.capability ?? null,
                runtime: 'node',
                commonVersion: item.common_version ?? null,
                ...(existingScript.currentVersionId ? {} : { status: 'available' }),
              },
            })
          : await this.prisma.client.script.create({
              data: {
                key,
                name: item.name,
                description: item.description,
                kind: item.kind,
                capability: item.capability ?? null,
                runtime: 'node',
                commonVersion: item.common_version ?? null,
                status: 'available',
              },
            });

        const manifest = {
          ...item,
          ...(item.manifest ?? {}),
        } as Prisma.InputJsonValue;

        const existingVersion = await this.prisma.client.scriptVersion.findFirst({
          where: { scriptId: script.id, version: item.version, sourceId: source.id },
        });
        if (existingVersion) {
          await this.prisma.client.scriptVersion.update({
            where: { id: existingVersion.id },
            data: {
              manifest,
              bundleHash: item.sha256 ?? existingVersion.bundleHash,
              sdkVersion: existingVersion.sdkVersion,
              commonVersion: item.common_version ?? existingVersion.commonVersion,
              reviewStatus: item.review_status,
              minPlatformVersion: item.min_platform_version ?? existingVersion.minPlatformVersion,
            },
          });
        } else {
          await this.prisma.client.scriptVersion.create({
            data: {
              scriptId: script.id,
              sourceId: source.id,
              version: item.version,
              manifest,
              bundleHash: item.sha256 ?? null,
              reviewStatus: item.review_status,
              minPlatformVersion: item.min_platform_version,
              commonVersion: item.common_version,
            },
          });
        }
        synced += 1;
      }

      const appKeys: string[] = [];
      for (const item of parsed.apps) {
        const key = assertSafeKey(item.key);
        const appId = item.appId || item.app_id;
        if (!appId) {
          throw new Error(`应用缺少 appId：${item.key}`);
        }
        if (!item.bundle_url && !item.files) {
          throw new Error(`应用缺少 bundle_url 或 files：${item.key}`);
        }
        if (item.bundle_url && !/^local:\/\//i.test(item.bundle_url)) {
          let resolved: URL;
          try {
            resolved = new URL(item.bundle_url, source.indexUrl);
          } catch {
            throw new Error(`bundle_url 不是合法地址：${item.key}`);
          }
          if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
            throw new Error(`bundle_url 只支持 http(s) 或 local://：${item.key}`);
          }
        }
        await this.prisma.client.sourceApp.upsert({
          where: { sourceId_key: { sourceId: source.id, key } },
          create: {
            sourceId: source.id,
            key,
            name: item.name,
            appId,
            platform: item.platform,
            description: item.description,
            iconUrl: item.icon_url ?? null,
            pointsName: item.points_name,
            category: item.category,
            version: item.version,
            manifest: item as Prisma.InputJsonValue,
            scriptCount: item.scripts.length,
          },
          update: {
            name: item.name,
            appId,
            platform: item.platform,
            description: item.description,
            iconUrl: item.icon_url ?? null,
            pointsName: item.points_name,
            category: item.category,
            version: item.version,
            manifest: item as Prisma.InputJsonValue,
            scriptCount: item.scripts.length,
          },
        });
        appKeys.push(key);
      }

      if (
        raw &&
        typeof raw === 'object' &&
        Array.isArray((raw as Record<string, unknown>).apps)
      ) {
        await this.prisma.client.sourceApp.deleteMany({
          where: {
            sourceId: source.id,
            ...(appKeys.length > 0 ? { key: { notIn: appKeys } } : {}),
          },
        });
      }

      await this.prisma.client.scriptSource.update({
        where: { id: source.id },
        data: { lastSyncedAt: new Date(), lastError: null },
      });
      const appScripts = parsed.apps.reduce(
        (sum, item) => sum + item.scripts.length,
        0,
      );
      return {
        sourceId: source.id,
        synced,
        topLevelScripts: synced,
        appScripts,
        scripts: synced + appScripts,
        apps: parsed.apps.length,
        generatedAt: parsed.generated_at ?? null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.client.scriptSource.update({
        where: { id: source.id },
        data: { lastError: message, lastSyncedAt: new Date() },
      });
      throw new AppError('source_sync_failed', `同步失败：${message}`, 502);
    }
  }

  async available(sourceId: string) {
    const source = await this.prisma.client.scriptSource.findUnique({ where: { id: sourceId } });
    if (!source) throw new AppError('not_found', '订阅源不存在', 404);
    const versions = await this.prisma.client.scriptVersion.findMany({
      where: { sourceId },
      orderBy: { createdAt: 'desc' },
      include: { script: true },
    });
    return versions.map((version) => ({
      id: version.id,
      scriptId: version.scriptId,
      scriptKey: version.script.key,
      scriptName: version.script.name,
      version: version.version,
      reviewStatus: version.reviewStatus,
      kind: version.script.kind,
      capability: version.script.capability,
      installed: Boolean(version.bundlePath),
      current: version.script.currentVersionId === version.id,
      bundlePath: version.bundlePath,
      createdAt: version.createdAt,
    }));
  }

  async install(scriptId: string, version?: string) {
    const script = await this.get(scriptId);
    const target = await this.prisma.client.scriptVersion.findFirst({
      where: {
        scriptId,
        ...(version ? { version } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { source: true },
    });
    if (!target) throw new AppError('version_not_found', '脚本版本不存在，请先同步订阅源', 404);

    let bundlePath = target.bundlePath;
    let bundleHash = target.bundleHash;

    if (!bundlePath) {
      const manifest = (target.manifest ?? {}) as Record<string, unknown>;
      const bundleUrl = String(manifest.bundle_url ?? manifest.bundleUrl ?? '');
      if (!bundleUrl) throw new AppError('bundle_missing', '版本缺少 bundle_url', 400);
      const absoluteUrl = target.source?.indexUrl
        ? new URL(bundleUrl, target.source.indexUrl)
        : new URL(bundleUrl);
      if (absoluteUrl.protocol !== 'http:' && absoluteUrl.protocol !== 'https:') {
        throw new AppError('bundle_missing', 'bundle_url 必须是 http(s)', 400);
      }
      const response = await fetch(absoluteUrl, { redirect: 'follow' });
      if (!response.ok) {
        throw new AppError('bundle_download_failed', `下载 bundle 失败：HTTP ${response.status}`, 502);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length === 0 || buffer.length > MAX_BUNDLE_BYTES) {
        throw new AppError('bundle_too_large', 'bundle 为空或超过 2MB', 400);
      }
      const hash = createHash('sha256').update(buffer).digest('hex');
      if (manifest.sha256 && String(manifest.sha256) !== hash) {
        throw new AppError('bundle_hash_mismatch', 'bundle sha256 校验失败', 400);
      }
      const key = assertSafeKey(script.key);
      const relativePath = `scripts/${key}/${target.version}/bundle.js`;
      const fullPath = resolve(dataRoot(), relativePath);
      const root = resolve(dataRoot());
      const rel = relative(root, fullPath);
      if (rel.startsWith('..') || isAbsolute(rel)) {
        throw new AppError('validation_failed', 'bundle 路径不合法', 400);
      }
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, buffer);
      bundlePath = relativePath;
      bundleHash = hash;
      await this.prisma.client.scriptVersion.update({
        where: { id: target.id },
        data: { bundlePath, bundleHash, bundleSize: buffer.length },
      });
    }

    const updated = await this.prisma.client.script.update({
      where: { id: scriptId },
      data: { currentVersionId: target.id, status: 'active' },
      include: { versions: { orderBy: { createdAt: 'desc' } } },
    });
    return { ok: true, script: updated, version: target.version, bundlePath, bundleHash };
  }

  async update(scriptId: string) {
    const versions = await this.prisma.client.scriptVersion.findMany({
      where: { scriptId },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    if (versions.length === 0) {
      throw new AppError('version_not_found', '没有可用版本，请先同步订阅源', 404);
    }
    return this.install(scriptId, versions[0].version);
  }

  async rollback(scriptId: string, version: string) {
    const script = await this.get(scriptId);
    const target = await this.prisma.client.scriptVersion.findFirst({
      where: { scriptId, version, bundlePath: { not: null } },
    });
    if (!target) throw new AppError('version_not_found', '该版本未安装或不存在', 404);
    const updated = await this.prisma.client.script.update({
      where: { id: script.id },
      data: { currentVersionId: target.id, status: 'active' },
      include: { versions: { orderBy: { createdAt: 'desc' } } },
    });
    return { ok: true, script: updated, version: target.version };
  }

  async setStatus(scriptId: string, status: 'active' | 'disabled' | 'available') {
    await this.get(scriptId);
    return this.prisma.client.script.update({
      where: { id: scriptId },
      data: { status },
    });
  }

  async versions(scriptId: string) {
    await this.get(scriptId);
    return this.prisma.client.scriptVersion.findMany({
      where: { scriptId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
