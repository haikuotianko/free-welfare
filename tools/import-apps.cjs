#!/usr/bin/env node
'use strict';

/**
 * 批量导入应用清单。
 *
 * 目录结构：
 *   data/apps/<key>/app.json
 *   data/apps/<key>/scripts/<file>.js
 *
 * 用法：
 *   pnpm import:apps
 *   pnpm import:apps -- --dir data/apps --enable
 *
 * app.json:
 * {
 *   "key": "demo",
 *   "name": "示例应用",
 *   "appId": "wx...",
 *   "pointsName": "积分",
 *   "description": "",
 *   "registrationMode": "unknown | none | auto | one_click | manual",
 *   "registrationNote": "",
 *   "rootUrls": ["api.example.com"],
 *   "scripts": [
 *     {
 *       "name": "签到",
 *       "filePath": "sign-in.js",
 *       "cron": "30 8 * * *",
 *       "capabilities": ["sign_in", "points"],
 *       "description": "",
 *       "enabled": false
 *     }
 *   ]
 * }
 */

const { existsSync, readFileSync, readdirSync, statSync } = require('node:fs');
const { createCipheriv, createHash, randomBytes } = require('node:crypto');
const { createRequire } = require('node:module');
const { join, resolve } = require('node:path');

const root = resolve(__dirname, '..');
const requireDb = createRequire(join(root, 'packages', 'db', 'package.json'));
const { PrismaClient } = requireDb('@prisma/client');

const prisma = new PrismaClient();
const args = process.argv.slice(2);

function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const appsDir = resolve(root, argValue('--dir', join('data', 'apps')));
const forceEnable = args.includes('--enable');
const bindAll = args.includes('--bind-all');

function encryptionKey() {
  const raw = String(process.env.APP_ENCRYPTION_KEY || '').trim();
  const key = raw
    ? Buffer.from(raw, 'base64')
    : createHash('sha256').update(String(process.env.AUTH_SESSION_SECRET || '')).digest();
  if (key.length !== 32) {
    throw new Error('APP_ENCRYPTION_KEY 必须是 32 字节 base64');
  }
  return key;
}

function encryptValue(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`;
}

function normalizeRootUrl(input) {
  const value = typeof input === 'string' ? input : input && input.url;
  const url = String(value || '').trim().replace(/\/+$/, '');
  if (!url) return null;
  const origin = /^https?:\/\//i.test(url) ? url : 'https://' + url;
  return {
    id: (input && input.id) || rootUrlId(origin),
    url: origin,
    purpose: (input && input.purpose) || '',
    pathPrefix: (input && input.pathPrefix) || '',
    usedBy: Array.isArray(input && input.usedBy) ? input.usedBy : [],
    required: input && input.required !== undefined ? Boolean(input.required) : true,
  };
}

function rootUrlId(origin) {
  return origin
    .replace(/^https?:\/\//i, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function readApps() {
  if (!existsSync(appsDir)) throw new Error(`目录不存在：${appsDir}`);
  const apps = [];
  for (const name of readdirSync(appsDir)) {
    if (name.startsWith('_')) continue;
    const dir = join(appsDir, name);
    if (!statSync(dir).isDirectory()) continue;
    const manifestPath = join(dir, 'app.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (!manifest.key || !manifest.name || !manifest.appId) {
      throw new Error(`${manifestPath} 缺少 key/name/appId`);
    }
    apps.push({ ...manifest, dir });
  }
  return apps;
}

async function importApp(app) {
  const rootUrls = (app.rootUrls || [])
    .map(normalizeRootUrl)
    .filter(Boolean);
  const origins = [...new Set(rootUrls.map((item) => item.url))];

  const site = await prisma.site.upsert({
    where: { key: app.key },
    create: {
      key: app.key,
      name: app.name,
      platform: app.platform || 'wechat_miniprogram',
      appId: app.appId,
      description: app.description || '',
      pointsName: app.pointsName || '积分',
      scriptMode: 'platform',
      registrationMode: app.registrationMode || 'unknown',
      registrationNote: app.registrationNote || '',
      networkMode: 'whitelist',
      rootUrls,
      allowedOrigins: origins,
      networkNotes: app.networkNotes || '',
      status: 'active',
      metadata: {
        source: 'qinglong-script/mini-program',
        importedAt: new Date().toISOString(),
      },
    },
    update: {
      name: app.name,
      appId: app.appId,
      description: app.description || '',
      pointsName: app.pointsName || '积分',
      networkMode: 'whitelist',
      rootUrls,
      allowedOrigins: origins,
      networkNotes: app.networkNotes || '',
      ...(app.registrationMode ? { registrationMode: app.registrationMode } : {}),
      ...(app.registrationNote !== undefined
        ? { registrationNote: app.registrationNote }
        : {}),
    },
  });

  const importedScripts = [];
  for (const script of app.scripts || []) {
    const filePath = String(script.filePath || '').replace(/\\/g, '/');
    const fullPath = join(app.dir, 'scripts', filePath);
    if (!existsSync(fullPath)) {
      throw new Error(`${app.key}: 脚本文件不存在 ${fullPath}`);
    }

    const existing = await prisma.siteScript.findFirst({
      where: { siteId: site.id, filePath },
    });
    const data = {
      name: script.name,
      description: script.description || '',
      filePath,
      args: script.args || '',
      cron: script.cron || '',
      timezone: script.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      capabilities: script.capabilities || [],
      enabled: forceEnable ? true : script.enabled === true,
      nextRunAt: null,
    };

    const saved = existing
      ? await prisma.siteScript.update({ where: { id: existing.id }, data })
      : await prisma.siteScript.create({ data: { ...data, siteId: site.id } });
    importedScripts.push(saved);
  }

  const capabilities = [
    ...new Set(importedScripts.flatMap((script) => script.capabilities)),
  ].sort();
  await prisma.site.update({ where: { id: site.id }, data: { capabilities } });

  let envCount = 0;
  for (const item of app.env || []) {
    const key = String(item.key || '').trim();
    if (!key) continue;
    const existing = await prisma.siteEnvVar.findUnique({
      where: { siteId_key: { siteId: site.id, key } },
    });
    if (existing) {
      await prisma.siteEnvVar.update({
        where: { id: existing.id },
        data: {
          secret: item.secret !== undefined ? Boolean(item.secret) : existing.secret,
          description: item.description || existing.description,
          enabled: item.enabled !== undefined ? Boolean(item.enabled) : existing.enabled,
        },
      });
    } else {
      await prisma.siteEnvVar.create({
        data: {
          siteId: site.id,
          key,
          valueEnc: encryptValue(''),
          secret: item.secret !== false,
          description: item.description || '',
          enabled: item.enabled !== false,
        },
      });
    }
    envCount += 1;
  }

  let bound = 0;
  if (bindAll) {
    const accounts = await prisma.wechatAccount.findMany({
      where: { status: 'alive' },
      select: { id: true },
    });
    for (const account of accounts) {
      await prisma.siteAccount.upsert({
        where: {
          siteId_wechatAccountId: { siteId: site.id, wechatAccountId: account.id },
        },
        create: { siteId: site.id, wechatAccountId: account.id, status: 'active' },
        update: {},
      });
      bound += 1;
    }
  }

  return { site, scripts: importedScripts, bound, envCount };
}

async function main() {
  const apps = readApps();
  if (!apps.length) {
    console.log(`没有找到 app.json：${appsDir}`);
    return;
  }

  for (const app of apps) {
    const { site, scripts, bound, envCount } = await importApp(app);
    console.log(
      `${site.key}\t${site.name}\t${site.pointsName}\t${scripts.length} 个脚本\t${envCount ? `环境变量 ${envCount}\t` : ''}${bound ? `绑定 ${bound} 个账号\t` : ''}${site.allowedOrigins.join(', ')}`,
    );
  }
  console.log(`完成：${apps.length} 个应用`);
}

main()
  .catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
