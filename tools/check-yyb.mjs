#!/usr/bin/env node
/**
 * 检查 YYB-Go-Enhanced 是否可达、集成接口是否启用。
 *
 * 用法：
 *   node tools/check-yyb.mjs
 *   node tools/check-yyb.mjs http://192.168.1.84:8000
 *
 * 会读取项目根目录 .env 的：
 *   YYB_BASE_URL
 *   YYB_INTEGRATION_TOKEN
 *   YYB_PROTOCOL_TOKEN
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv(resolve(process.cwd(), '.env'));

const base = (
  process.argv[2] ||
  process.env.YYB_BASE_URL ||
  ''
).replace(/\/+$/, '');
const integrationToken = process.env.YYB_INTEGRATION_TOKEN || '';
const protocolToken = process.env.YYB_PROTOCOL_TOKEN || '';

if (!base) {
  console.error('缺少 YYB_BASE_URL。用法：node tools/check-yyb.mjs http://192.168.1.84:8000');
  process.exit(1);
}

async function request(path, headers = {}) {
  const response = await fetch(base + path, {
    headers,
    signal: AbortSignal.timeout(8000),
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 300);
  }
  return { status: response.status, body };
}

function brief(value) {
  if (typeof value === 'string') return value.slice(0, 300);
  return JSON.stringify(value).slice(0, 500);
}

console.log(`YYB: ${base}`);
console.log(`YYB_INTEGRATION_TOKEN: ${integrationToken ? '已配置' : '未配置'}`);
console.log(`YYB_PROTOCOL_TOKEN: ${protocolToken ? '已配置' : '未配置'}`);
console.log('');

let reachable = true;
let integrationReady = false;

try {
  const health = await request('/health');
  const healthy = health.status === 200 && (health.body?.data?.ok ?? health.body?.ok ?? true);
  console.log(`[health] ${health.status} ${brief(health.body)}`);
  if (!healthy) reachable = false;
} catch (error) {
  reachable = false;
  console.log(`[health] 无法连接：${error.message}`);
}

try {
  const manifest = await request('/integration/module-manifest.json');
  console.log(`[integration manifest] ${manifest.status} ${brief(manifest.body)}`);
  if (manifest.status !== 200) reachable = false;
} catch (error) {
  reachable = false;
  console.log(`[integration manifest] 请求失败：${error.message}`);
}

if (!integrationToken) {
  console.log('');
  console.log('[integration accounts] 跳过：本地没有 YYB_INTEGRATION_TOKEN');
  console.log('');
  console.log('下一步：');
  console.log('1. 在 NAS 的 YYB 项目根目录 .env 里设置 YYB_INTEGRATION_TOKEN=随机字符串');
  console.log('2. 重启/重建 YYB 容器（docker compose up -d）');
  console.log('3. 把同一个值填到本项目 .env / deploy/compose/.env');
  console.log('4. 再运行 node tools/check-yyb.mjs');
} else {
  try {
    const accounts = await request('/integration/accounts', {
      Authorization: `Bearer ${integrationToken}`,
    });
    console.log(`[integration accounts] ${accounts.status} ${brief(accounts.body)}`);
    if (accounts.status === 200) {
      integrationReady = true;
    } else if (accounts.status === 401) {
      console.log('→ 平台和 YYB 的 YYB_INTEGRATION_TOKEN 不一致');
    } else if (accounts.status === 503) {
      console.log('→ YYB 没有启用集成接口：容器里没有读到 YYB_INTEGRATION_TOKEN');
      console.log('→ 在 NAS 上检查：docker exec yyb-go printenv YYB_INTEGRATION_TOKEN');
      console.log('→ 为空时：cd <YYB目录> && docker compose up -d --force-recreate');
    }
  } catch (error) {
    console.log(`[integration accounts] 请求失败：${error.message}`);
  }
}

console.log('');
if (!reachable) {
  console.log('YYB 不可达；检查地址、端口、防火墙/NAS 网络。');
  process.exit(1);
}
if (!integrationReady) {
  console.log('YYB 可达，但平台集成未就绪：需要配置 YYB_INTEGRATION_TOKEN。');
  process.exit(2);
}
console.log('YYB 可达，集成接口可用。');
process.exit(0);
