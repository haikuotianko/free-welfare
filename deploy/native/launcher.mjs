import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const envFile = join(root, '.env');
const nativeNodeModules = join(here, 'node_modules', 'embedded-postgres');
let pidFile = join(root, 'data', 'native.pid');
const isWindows = process.platform === 'win32';

const children = [];
let pg = null;
let shuttingDown = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function secret(bytes = 32) {
  return randomBytes(bytes).toString('base64');
}

function password() {
  return randomBytes(18).toString('hex');
}

function ensureEnvFile() {
  if (existsSync(envFile)) return;

  const template = join(root, 'deploy', 'compose', '.env.example');
  if (!existsSync(template)) {
    throw new Error(`缺少环境变量模板：${template}`);
  }

  const dbPassword = password();
  const appPort = Number(process.env.APP_PORT || 3000);
  const pgPort = Number(process.env.EMBEDDED_PG_PORT || 5433);
  let text = readFileSync(template, 'utf8');

  text = text
    .replace(/^APP_URL=.*$/m, `APP_URL=http://localhost:${appPort}`)
    .replace(/^APP_PORT=.*$/m, `APP_PORT=${appPort}`)
    .replace(/^APP_ENCRYPTION_KEY=.*$/m, `APP_ENCRYPTION_KEY=${secret()}`)
    .replace(/^AUTH_SESSION_SECRET=.*$/m, `AUTH_SESSION_SECRET=${secret()}`)
    .replace(/^POSTGRES_PASSWORD=.*$/m, `POSTGRES_PASSWORD=${dbPassword}`)
    .replace(
      /^DATABASE_URL=.*$/m,
      `DATABASE_URL=postgresql://welfare:${dbPassword}@127.0.0.1:${pgPort}/welfare?schema=public`,
    )
    .replace(/^DATA_DIR=.*$/m, 'DATA_DIR=./data')
    .replace(
      /^SCRIPT_SOURCE_URL=.*$/m,
      'SCRIPT_SOURCE_URL=https://raw.githubusercontent.com/haikuotianko/free-welfare-scripts/main/index.json',
    )
    .replace(/^YYB_BASE_URL=.*$/m, 'YYB_BASE_URL=http://127.0.0.1:8000');

  writeFileSync(envFile, text, 'utf8');
  console.log('已生成 .env（本地内置 PostgreSQL，端口 5433）。');
}

function loadEnv() {
  try {
    loadEnvFile(envFile);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function resolveDataDir() {
  const dir = resolve(root, process.env.NATIVE_DATA_DIR || 'data');
  mkdirSync(dir, { recursive: true });
  process.env.DATA_DIR = dir;
  return dir;
}

function readPid() {
  try {
    return Number(readFileSync(pidFile, 'utf8').trim()) || null;
  } catch {
    return null;
  }
}

function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function portInUse(port) {
  return new Promise((resolvePort) => {
    import('node:net').then(({ connect }) => {
      const socket = connect({ host: '127.0.0.1', port });
      const done = (value) => {
        socket.destroy();
        resolvePort(value);
      };
      socket.once('connect', () => done(true));
      socket.once('error', () => done(false));
      socket.setTimeout(700, () => done(false));
    });
  });
}

function openBrowser(url) {
  if (process.env.NO_OPEN === '1') {
    console.log(`已跳过自动打开浏览器：${url}`);
    return;
  }
  try {
    if (isWindows) {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch {
    console.log(`请在浏览器打开：${url}`);
  }
}

async function waitHealth(url, timeoutMs = 60000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {}
    await delay(500);
  }
  return false;
}

function runMigrations() {
  console.log('正在执行数据库迁移…');
  const result = spawnSync(process.execPath, [join(root, 'tools', 'migrate.mjs')], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error('数据库迁移失败');
}

function startNode(name, entry) {
  if (!existsSync(entry)) {
    throw new Error(`缺少 ${name} 构建产物：${entry}。请先运行 npm run npm:build 或 pnpm build。`);
  }
  const child = spawn(process.execPath, [entry], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    windowsHide: false,
  });
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`[${name}] 已退出（code=${code ?? 'unknown'}）`);
      void shutdown(code ?? 1);
    }
  });
  children.push(child);
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n正在停止 Free Welfare…');

  for (const child of children) {
    try {
      child.kill('SIGTERM');
    } catch {}
  }
  await delay(800);
  for (const child of children) {
    try {
      child.kill('SIGKILL');
    } catch {}
  }
  if (pg) {
    try {
      await pg.stop();
    } catch {}
  }
  try {
    unlinkSync(pidFile);
  } catch {}
  process.exitCode = code;
}

async function main() {
  const major = Number(process.versions.node.split('.')[0]);
  if (!Number.isFinite(major) || major < 22) {
    console.error(`需要 Node.js 22+，当前为 ${process.versions.node}`);
    process.exit(1);
  }

  if (!existsSync(nativeNodeModules)) {
    console.error(
      '缺少内置数据库依赖。请在项目根目录运行：\n' +
        '  npm install --prefix deploy/native\n' +
        '或\n' +
        '  pnpm --dir deploy/native install',
    );
    process.exit(1);
  }

  ensureEnvFile();
  loadEnv();
  const dataDir = resolveDataDir();
  pidFile = join(dataDir, 'native.pid');
  const appPort = Number(process.env.APP_PORT || 3000);
  const pgPort = Number(process.env.EMBEDDED_PG_PORT || 5433);
  const useEmbedded = process.env.EMBEDDED_PG !== 'false';
  const url = `http://localhost:${appPort}`;

  const oldPid = readPid();
  if (isAlive(oldPid)) {
    console.log(`Free Welfare 已在运行（PID ${oldPid}）。`);
    openBrowser(url);
    return;
  }
  if (await portInUse(appPort)) {
    throw new Error(`端口 ${appPort} 已被占用。请先停止占用该端口的程序，或在 .env 设置 APP_PORT。`);
  }
  if (useEmbedded && (await portInUse(pgPort))) {
    throw new Error(`内置 PostgreSQL 端口 ${pgPort} 已被占用。请设置 EMBEDDED_PG_PORT 或停止占用程序。`);
  }

  mkdirSync(dataDir, { recursive: true });
  writeFileSync(pidFile, String(process.pid), 'utf8');

  try {
    if (useEmbedded) {
      const dbPassword = process.env.POSTGRES_PASSWORD;
      if (!dbPassword) throw new Error('.env 缺少 POSTGRES_PASSWORD');
      const pgDir = join(dataDir, 'postgres');
      const { default: EmbeddedPostgres } = await import('embedded-postgres');
      pg = new EmbeddedPostgres({
        databaseDir: pgDir,
        user: 'welfare',
        password: dbPassword,
        port: pgPort,
        persistent: true,
        autoRehydrateSymlinks: true,
      });
      if (!existsSync(join(pgDir, 'PG_VERSION'))) {
        console.log('正在初始化内置 PostgreSQL…');
        await pg.initialise();
      }
      console.log(`正在启动内置 PostgreSQL（127.0.0.1:${pgPort}）…`);
      await pg.start();
      try {
        await pg.createDatabase('welfare');
      } catch (error) {
        if (!/already exists/i.test(String(error?.message || error))) throw error;
      }
      process.env.DATABASE_URL = `postgresql://welfare:${encodeURIComponent(dbPassword)}@127.0.0.1:${pgPort}/welfare?schema=public`;
    }

    process.env.DATA_DIR = dataDir;
    process.env.NODE_ENV = process.env.NODE_ENV || 'production';
    const currentAppUrl = process.env.APP_URL || '';
    if (!currentAppUrl || /^http:\/\/localhost(:\d+)?\/?$/.test(currentAppUrl)) {
      process.env.APP_URL = url;
    }
    process.env.APP_PORT = String(appPort);

    runMigrations();
    startNode('api', join(root, 'apps', 'api', 'dist', 'main.js'));
    startNode('worker', join(root, 'apps', 'worker', 'dist', 'main.js'));

    console.log(`\nFree Welfare 正在启动：${url}`);
    if (useEmbedded) console.log(`数据库：内置 PostgreSQL（${dataDir}\\postgres）`);
    if (await waitHealth(`${url}/api/v1/health`)) {
      console.log(`已就绪：${url}`);
      openBrowser(url);
    } else {
      console.log(`API 尚未就绪，请稍后手动打开：${url}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    await shutdown(1);
  }
}

process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await shutdown(1);
});
