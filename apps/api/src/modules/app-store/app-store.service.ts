import { Injectable } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve, sep } from 'node:path';
import type { Prisma } from '@free-welfare/db';
import { CAPABILITIES, DEFAULT_TIMEZONE } from '@free-welfare/shared';
import { PrismaService } from '../../database/prisma.service';
import { AppError } from '../../common/app-error';
import { SecurityService } from '../../common/security.service';
import { siteDir } from '../../common/app-data';
import { readSourceBuffer } from '../../common/source-content';
import { ScriptsService } from '../scripts/scripts.service';

const MAX_BUNDLE_BYTES = 4 * 1024 * 1024;
const MAX_FILES = 100;

type FileMap = Record<string, string>;

type ScriptMeta = {
  name?: string;
  file_path?: string;
  filePath?: string;
  description?: string;
  cron?: string;
  timezone?: string;
  args?: string;
  capabilities?: string[];
  enabled?: boolean;
};

type EnvMeta = {
  key?: string;
  description?: string;
  secret?: boolean;
  enabled?: boolean;
};

type RootUrlInput =
  | string
  | {
      id?: string;
      url?: string;
      purpose?: string;
      pathPrefix?: string;
      usedBy?: string[];
      required?: boolean;
    };

type AppManifest = {
  root_urls?: RootUrlInput[];
  scripts?: ScriptMeta[];
  env?: EnvMeta[];
  bundle_url?: string;
  files?: unknown;
  icon_url?: string;
  network_notes?: string;
  [key: string]: unknown;
};

function assertSafeKey(key: string): string {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(key) || key.includes('..')) {
    throw new AppError('validation_failed', '应用 key 不合法', 400);
  }
  return key;
}

const ALLOWED_EXTENSIONS = /\.(js|ts|mjs|cjs|json|md|txt)$/i;

function normalizeFilePath(input: string): string {
  const value = String(input ?? '').replace(/\\/g, '/').trim().replace(/^\/+/, '');
  if (
    !value ||
    value.includes('\0') ||
    value.split('/').some((part) => part === '..') ||
    !ALLOWED_EXTENSIONS.test(value)
  ) {
    throw new AppError('validation_failed', '应用脚本路径不合法', 400);
  }
  return value;
}

function normalizeRootUrl(input: RootUrlInput): {
  id: string;
  url: string;
  purpose: string;
  pathPrefix: string;
  usedBy: string[];
  required: boolean;
} {
  const value = typeof input === 'string' ? input : input?.url;
  const raw = String(value ?? '').trim().replace(/\/+$/, '');
  if (!raw) throw new AppError('validation_failed', '根 URL 为空', 400);
  const url = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppError('validation_failed', '根 URL 只支持 http(s)', 400);
  }
  return {
    id:
      (typeof input === 'object' && input?.id) ||
      url
        .replace(/^https?:\/\//i, '')
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase(),
    url,
    purpose: (typeof input === 'object' && input?.purpose) || '',
    pathPrefix: (typeof input === 'object' && input?.pathPrefix) || '',
    usedBy: Array.isArray((input as { usedBy?: string[] })?.usedBy)
      ? (input as { usedBy: string[] }).usedBy
      : [],
    required:
      typeof input === 'object' && input?.required !== undefined
        ? Boolean(input.required)
        : true,
  };
}

function normalizeFiles(payload: unknown): FileMap {
  const files: FileMap = {};
  const object =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const source = object.files ?? object.scripts ?? payload;

  if (Array.isArray(source)) {
    for (const item of source) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const filePath = String(record.path ?? record.filePath ?? record.file ?? '');
      const content = record.content;
      if (filePath && typeof content === 'string') files[filePath] = content;
    }
  } else if (source && typeof source === 'object') {
    for (const [filePath, content] of Object.entries(source)) {
      if (typeof content === 'string') files[filePath] = content;
    }
  }

  const normalized: FileMap = {};
  for (const [filePath, content] of Object.entries(files)) {
    const cleaned = normalizeFilePath(filePath.replace(/^scripts\//i, ''));
    normalized[cleaned] = content;
  }
  if (Object.keys(normalized).length === 0) {
    throw new AppError('bundle_invalid', '应用包没有可下载的脚本文件', 400);
  }
  if (Object.keys(normalized).length > MAX_FILES) {
    throw new AppError('bundle_invalid', `应用包文件数超过 ${MAX_FILES}`, 400);
  }
  return normalized;
}

function capabilitiesOf(input: string[] | undefined): string[] {
  if (!Array.isArray(input)) return [];
  const allowed = new Set<string>(CAPABILITIES);
  return [...new Set(input.filter((item) => allowed.has(item)))];
}

@Injectable()
export class AppStoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scripts: ScriptsService,
    private readonly security: SecurityService,
  ) {}

  sources() {
    return this.prisma.client.scriptSource.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { apps: true, versions: true } } },
    });
  }

  createSource(input: {
    name: string;
    repoUrl: string;
    branch: string;
    indexUrl: string;
    trustLevel: string;
  }) {
    return this.scripts.createSource(input);
  }

  syncSource(id: string) {
    return this.scripts.syncSource(id);
  }

  async removeSource(id: string) {
    const source = await this.prisma.client.scriptSource.findUnique({ where: { id } });
    if (!source) throw new AppError('not_found', '应用源不存在', 404);
    await this.prisma.client.scriptSource.delete({ where: { id } });
    return { ok: true };
  }

  async apps(query: {
    q?: string;
    sourceId?: string;
    installed?: boolean;
    category?: string;
  }) {
    const where: Prisma.SourceAppWhereInput = {};
    if (query.sourceId) where.sourceId = query.sourceId;
    if (query.category) where.category = query.category;
    if (query.q) {
      const q = query.q.trim();
      if (q) {
        where.OR = [
          { name: { contains: q, mode: 'insensitive' } },
          { key: { contains: q, mode: 'insensitive' } },
          { appId: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ];
      }
    }

    const rows = await this.prisma.client.sourceApp.findMany({
      where,
      orderBy: [{ source: { createdAt: 'asc' } }, { name: 'asc' }],
      select: {
        id: true,
        key: true,
        name: true,
        appId: true,
        platform: true,
        description: true,
        iconUrl: true,
        pointsName: true,
        category: true,
        version: true,
        scriptCount: true,
        updatedAt: true,
        source: {
          select: {
            id: true,
            name: true,
            trustLevel: true,
            indexUrl: true,
            lastSyncedAt: true,
          },
        },
      },
    });

    const sites = await this.prisma.client.site.findMany({
      where: { key: { in: rows.map((row) => row.key) } },
      select: {
        id: true,
        key: true,
        name: true,
        iconUrl: true,
        sourceId: true,
        sourceAppKey: true,
        metadata: true,
      },
    });
    const byKey = new Map(sites.map((site) => [site.key, site]));

    const items = rows.map((row) => {
      const site = byKey.get(row.key) ?? null;
      const metadata =
        site?.metadata && typeof site.metadata === 'object'
          ? (site.metadata as Record<string, unknown>)
          : {};
      const installedVersion =
        typeof metadata.sourceVersion === 'string' ? metadata.sourceVersion : '';
      return {
        ...row,
        installed: Boolean(site),
        site: site
          ? {
              id: site.id,
              name: site.name,
              iconUrl: site.iconUrl,
              sourceId: site.sourceId,
              sourceAppKey: site.sourceAppKey,
            }
          : null,
        updateAvailable: Boolean(
          site &&
            row.version &&
            installedVersion &&
            installedVersion !== row.version,
        ),
      };
    });

    if (query.installed === true) return items.filter((item) => item.installed);
    if (query.installed === false) return items.filter((item) => !item.installed);
    return items;
  }

  async app(id: string) {
    const row = await this.prisma.client.sourceApp.findUnique({
      where: { id },
      include: { source: true },
    });
    if (!row) throw new AppError('not_found', '应用源条目不存在', 404);
    return row;
  }

  async install(
    id: string,
    bindAll = false,
    preserveUserConfig = false,
    enableScripts = false,
  ) {
    const app = await this.app(id);
    const manifest = (app.manifest ?? {}) as AppManifest;
    const key = assertSafeKey(app.key);
    const existing = await this.prisma.client.site.findUnique({ where: { key } });

    const files = await this.loadFiles(app, manifest);
    const scriptMeta = Array.isArray(manifest.scripts) ? manifest.scripts : [];
    const scriptEntries: ScriptMeta[] =
      scriptMeta.length > 0
        ? scriptMeta
        : Object.keys(files).map((filePath) => ({
            name: basename(filePath).replace(/\.[^.]+$/, ''),
            file_path: filePath,
            description: '',
            cron: '',
            timezone: DEFAULT_TIMEZONE,
            args: '',
            capabilities: [],
            enabled: false,
          }));

    for (const script of scriptEntries) {
      const filePath = normalizeFilePath(
        String(script.file_path ?? script.filePath ?? ''),
      );
      if (!files[filePath]) {
        throw new AppError(
          'bundle_invalid',
          `应用包缺少脚本文件：${filePath}`,
          400,
        );
      }
    }

    const rootUrls = (Array.isArray(manifest.root_urls) ? manifest.root_urls : [])
      .map((item) => normalizeRootUrl(item));
    const origins = [...new Set(rootUrls.map((item) => item.url))];
    const iconUrl =
      typeof manifest.icon_url === 'string' &&
      /^https?:\/\//i.test(manifest.icon_url)
        ? manifest.icon_url
        : null;

    const site = await this.prisma.client.site.upsert({
      where: { key },
      create: {
        key,
        name: app.name,
        platform: app.platform,
        appId: app.appId,
        iconUrl,
        description: app.description,
        pointsName: app.pointsName,
        scriptMode: 'platform',
        networkMode: 'whitelist',
        rootUrls: rootUrls as Prisma.InputJsonValue,
        allowedOrigins: origins,
        networkNotes: String(manifest.network_notes ?? ''),
        status: 'active',
        sourceId: app.sourceId,
        sourceAppKey: app.key,
        metadata: {
          sourceId: app.sourceId,
          sourceName: app.source.name,
          sourceKey: app.source.indexUrl,
          sourceAppKey: app.key,
          sourceVersion: app.version,
          installedAt: new Date().toISOString(),
        },
      },
      update: {
        name: app.name,
        platform: app.platform,
        appId: app.appId,
        iconUrl,
        description: app.description,
        pointsName: app.pointsName,
        networkMode: 'whitelist',
        rootUrls: rootUrls as Prisma.InputJsonValue,
        allowedOrigins: origins,
        networkNotes: String(manifest.network_notes ?? ''),
        sourceId: app.sourceId,
        sourceAppKey: app.key,
        metadata: {
          ...(existing?.metadata && typeof existing.metadata === 'object'
            ? (existing.metadata as Record<string, unknown>)
            : {}),
          sourceId: app.sourceId,
          sourceName: app.source.name,
          sourceKey: app.source.indexUrl,
          sourceAppKey: app.key,
          sourceVersion: app.version,
          updatedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    const scriptsDir = resolve(siteDir(site.key), 'scripts');
    for (const [filePath, content] of Object.entries(files)) {
      const full = resolve(scriptsDir, filePath);
      if (full !== scriptsDir && !full.startsWith(scriptsDir + sep)) {
        throw new AppError('validation_failed', '应用脚本路径越界', 400);
      }
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, content, 'utf8');
    }

    let envCount = 0;
    for (const item of Array.isArray(manifest.env) ? manifest.env : []) {
      const envKey = String(item.key ?? '').trim();
      if (!envKey) continue;
      const current = await this.prisma.client.siteEnvVar.findUnique({
        where: { siteId_key: { siteId: site.id, key: envKey } },
      });
      if (current) {
        await this.prisma.client.siteEnvVar.update({
          where: { id: current.id },
          data: {
            secret: item.secret !== undefined ? Boolean(item.secret) : current.secret,
            description: item.description || current.description,
            enabled:
              item.enabled !== undefined ? Boolean(item.enabled) : current.enabled,
          },
        });
      } else {
        await this.prisma.client.siteEnvVar.create({
          data: {
            siteId: site.id,
            key: envKey,
            valueEnc: this.security.encrypt(''),
            secret: item.secret !== false,
            description: item.description || '',
            enabled: item.enabled !== false,
          },
        });
      }
      envCount += 1;
    }

    const savedScripts = [];
    for (const script of scriptEntries) {
      const filePath = normalizeFilePath(
        String(script.file_path ?? script.filePath ?? ''),
      );
      const current = await this.prisma.client.siteScript.findFirst({
        where: { siteId: site.id, filePath },
      });
      const base = {
        name: script.name || basename(filePath).replace(/\.[^.]+$/, ''),
        description: script.description || '',
        capabilities: capabilitiesOf(script.capabilities),
        filePath,
      };
      const saved = current
        ? await this.prisma.client.siteScript.update({
            where: { id: current.id },
            data: preserveUserConfig
              ? {
                  name: base.name,
                  description: base.description,
                  capabilities: base.capabilities,
                }
              : {
                  ...base,
                  cron: script.cron || '',
                  timezone: script.timezone || DEFAULT_TIMEZONE,
                  args: script.args || '',
                  enabled: enableScripts && script.enabled === true,
                  nextRunAt: null,
                },
          })
        : await this.prisma.client.siteScript.create({
            data: {
              siteId: site.id,
              ...base,
              cron: script.cron || '',
              timezone: script.timezone || DEFAULT_TIMEZONE,
              args: script.args || '',
              enabled: enableScripts && script.enabled === true,
            },
          });
      savedScripts.push(saved);
    }

    const allScripts = await this.prisma.client.siteScript.findMany({
      where: { siteId: site.id },
      select: { capabilities: true },
    });
    const capabilities = [
      ...new Set(allScripts.flatMap((item) => item.capabilities)),
    ].sort();
    await this.prisma.client.site.update({
      where: { id: site.id },
      data: { capabilities },
    });

    let bound = 0;
    if (bindAll) {
      const accounts = await this.prisma.client.wechatAccount.findMany({
        where: { status: 'alive' },
        select: { id: true },
      });
      for (const account of accounts) {
        await this.prisma.client.siteAccount.upsert({
          where: {
            siteId_wechatAccountId: {
              siteId: site.id,
              wechatAccountId: account.id,
            },
          },
          create: {
            siteId: site.id,
            wechatAccountId: account.id,
            status: 'active',
          },
          update: {},
        });
        bound += 1;
      }
    }

    return {
      ok: true,
      appId: app.id,
      site: await this.prisma.client.site.findUnique({
        where: { id: site.id },
        include: {
          scripts: { orderBy: { createdAt: 'asc' } },
          envVars: {
            select: {
              id: true,
              key: true,
              description: true,
              secret: true,
              enabled: true,
            },
          },
        },
      }),
      created: !existing,
      files: Object.keys(files),
      scripts: savedScripts.length,
      envCount,
      bound,
    };
  }

  update(id: string, bindAll = false) {
    return this.install(id, bindAll, true);
  }

  private async loadFiles(
    app: { source: { indexUrl: string } },
    manifest: AppManifest,
  ): Promise<FileMap> {
    if (manifest.files) return normalizeFiles(manifest.files);
    if (typeof manifest.bundle_url !== 'string' || !manifest.bundle_url) {
      throw new AppError('bundle_missing', '应用没有 bundle_url', 400);
    }
    const buffer = await readSourceBuffer(manifest.bundle_url, app.source.indexUrl);
    if (buffer.length === 0 || buffer.length > MAX_BUNDLE_BYTES) {
      throw new AppError('bundle_invalid', '应用包为空或超过 4MB', 400);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/, ''));
    } catch {
      throw new AppError('bundle_invalid', '应用包不是合法 JSON', 400);
    }
    return normalizeFiles(parsed);
  }
}
