#!/usr/bin/env node
'use strict';

/**
 * 把 data/apps/<key>/app.json 打包成应用源。
 *
 * 输出：
 *   data/app-store/index.json
 *   data/app-store/bundles/<key>.json
 *
 * 用法：
 *   pnpm build:app-source
 *   pnpm build:app-source -- --dir data/apps --out data/app-store
 */

const { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { join, resolve } = require('node:path');

const root = resolve(__dirname, '..');
const args = process.argv.slice(2);

function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const appsDir = resolve(root, argValue('--dir', join('data', 'apps')));
const outDir = resolve(root, argValue('--out', join('data', 'app-store')));
const bundleBase = argValue('--bundle-base', 'local://app-store/bundles');

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

function build() {
  const apps = readApps();
  mkdirSync(join(outDir, 'bundles'), { recursive: true });

  const indexApps = [];
  for (const app of apps) {
    const files = {};
    for (const script of app.scripts || []) {
      const filePath = String(script.filePath || '').replace(/\\/g, '/');
      const fullPath = join(app.dir, 'scripts', filePath);
      if (!existsSync(fullPath)) {
        throw new Error(`${app.key}: 脚本文件不存在 ${fullPath}`);
      }
      files[filePath] = readFileSync(fullPath, 'utf8');
    }

    const bundleText = JSON.stringify({ files }, null, 2) + '\n';
    writeFileSync(
      join(outDir, 'bundles', `${app.key}.json`),
      bundleText,
      'utf8',
    );
    const bundleVersion = app.version
      ? String(app.version)
      : 'local-' + createHash('sha256').update(bundleText).digest('hex').slice(0, 12);

    indexApps.push({
      key: app.key,
      name: app.name,
      appId: app.appId,
      platform: app.platform || 'wechat_miniprogram',
      description: app.description || '',
      icon_url: app.iconUrl || '',
      points_name: app.pointsName || '积分',
      category: app.category || '',
      version: bundleVersion,
      root_urls: app.rootUrls || [],
      network_notes: app.networkNotes || '',
      env: app.env || [],
      scripts: (app.scripts || []).map((script) => ({
        name: script.name,
        file_path: String(script.filePath || '').replace(/\\/g, '/'),
        description: script.description || '',
        cron: script.cron || '',
        timezone: script.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        args: script.args || '',
        capabilities: script.capabilities || [],
        enabled: script.enabled === true,
      })),
      bundle_url: `${bundleBase}/${app.key}.json`,
    });
  }

  const index = {
    schema_version: 2,
    generated_at: new Date().toISOString(),
    scripts: [],
    apps: indexApps,
  };
  writeFileSync(join(outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');

  console.log(`应用源已生成：${indexApps.length} 个应用 -> ${outDir}`);
}

try {
  build();
} catch (error) {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}
