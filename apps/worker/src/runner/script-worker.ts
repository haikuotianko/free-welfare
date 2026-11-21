import { parentPort, workerData } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import vm from 'node:vm';
import {
  ScriptError,
  createScriptContext,
  type ActivityApi,
  type ArtifactRecord,
  type ArtifactWriteOptions,
  type CacheScope,
  type HttpRequestOptions,
  type HttpResponse,
  type LogLevel,
  type NotifyOptions,
  type OrderApi,
  type PointLotRecord,
  type PointTransactionInput,
  type PointTransactionRecord,
  type PointsSnapshot,
  type ProductInput,
  type ProductKind,
  type ProductListOptions,
  type ProductRecord,
  type ProductSyncOptions,
  type ProductSyncResult,
  type ScriptHost,
  type ScriptMode,
  type SessionApi,
  type UserInfo,
} from '@free-welfare/sdk';
import type {
  ParentToWorkerMessage,
  RpcResultMessage,
  ScriptWorkerData,
  WorkerToParentMessage,
} from './protocol';
import { createCryptoApi } from './crypto';
import { redactText, redactValue } from './redact';

const data = workerData as ScriptWorkerData;
const port = parentPort;
if (!port) throw new Error('script worker requires parentPort');

let sequence = 0;
const pending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>();

function post(message: WorkerToParentMessage): void {
  port!.postMessage(message);
}

function call<T>(method: string, ...args: unknown[]): Promise<T> {
  const id = ++sequence;
  return new Promise<T>((resolvePromise, rejectPromise) => {
    pending.set(id, {
      resolve: (value) => resolvePromise(value as T),
      reject: rejectPromise,
    });
    post({ type: 'rpc', id, method, args });
  });
}

port.on('message', (message: ParentToWorkerMessage) => {
  if (message.type !== 'rpc-result') return;
  const entry = pending.get(message.id);
  if (!entry) return;
  pending.delete(message.id);
  if (message.ok) {
    entry.resolve(message.value);
  } else {
    const error = new Error(message.error?.message ?? '脚本调用失败') as Error & {
      code?: string;
      details?: unknown;
    };
    error.code = message.error?.code ?? 'rpc_error';
    error.details = message.error?.details;
    entry.reject(error);
  }
});

function log(level: LogLevel, message: string, payload?: unknown): void {
  post({ type: 'log', level, message: redactText(String(message)), data: redactValue(payload) });
}

function toArtifactPayload(content: string | Uint8Array): {
  content: string;
  encoding: 'utf8' | 'base64';
} {
  if (typeof content === 'string') return { content, encoding: 'utf8' };
  return { content: Buffer.from(content).toString('base64'), encoding: 'base64' };
}

const host: ScriptHost = {
  run: data.run,
  app: data.app,
  account: data.account,
  config: data.config,
  appConfig: data.appConfig,
  env: data.env,
  input: data.input ?? {},
  mode: data.mode,
  offsetMs: 0,
  cache: {
    get: (scope: CacheScope, key: string) => call('cache.get', scope, key),
    set: (scope: CacheScope, key: string, value: unknown, ttlSeconds?: number) =>
      call('cache.set', scope, key, value, ttlSeconds),
    delete: (scope: CacheScope, key: string) => call('cache.delete', scope, key),
    has: (scope: CacheScope, key: string) => call('cache.has', scope, key),
    increment: (scope: CacheScope, key: string, by?: number, ttlSeconds?: number) =>
      call('cache.increment', scope, key, by, ttlSeconds),
    touch: (scope: CacheScope, key: string, ttlSeconds: number) =>
      call('cache.touch', scope, key, ttlSeconds),
    clear: (scope: CacheScope) => call('cache.clear', scope),
  },
  http: {
    request: (options: HttpRequestOptions) => call<HttpResponse>('http.request', options),
  },
  yyb: {
    getCode: (options) => call('yyb.getCode', options),
    getPhoneNumber: () => call('yyb.getPhoneNumber'),
    getPhoneAuth: (options) => call('yyb.getPhoneAuth', options),
    operateWxData: (payload) => call('yyb.operateWxData', payload),
    health: () => call('yyb.health'),
    listAccounts: () => call('yyb.listAccounts'),
    refreshAccount: () => call('yyb.refreshAccount'),
  },
  user: {
    getInfo: () => call<UserInfo>('user.getInfo'),
    getPhone: () => call('user.getPhone'),
    getPoints: () => call('user.getPoints'),
  },
  session: {
    get: () => call('session.get'),
    save: (value, expiresAt) => call('session.save', value, expiresAt),
    clear: () => call('session.clear'),
  },
  refreshAccount: () => call('account.refresh'),
  products: {
    list: (kind: ProductKind, options?: ProductListOptions) =>
      call<ProductRecord[]>('products.list', kind, options),
    get: (kind: ProductKind, externalId: string) =>
      call<ProductRecord | null>('products.get', kind, externalId),
    upsert: (kind: ProductKind, input: ProductInput) =>
      call<ProductRecord>('products.upsert', kind, input),
    upsertMany: (kind: ProductKind, inputs: ProductInput[]) =>
      call<ProductRecord[]>('products.upsertMany', kind, inputs),
    sync: (kind: ProductKind, inputs: ProductInput[], options?: ProductSyncOptions) =>
      call<ProductSyncResult>('products.sync', kind, inputs, options),
    update: (kind: ProductKind, externalId: string, patch: Partial<ProductInput>) =>
      call<ProductRecord>('products.update', kind, externalId, patch),
    setStock: (kind: ProductKind, externalId: string, stock: number | null) =>
      call<ProductRecord>('products.setStock', kind, externalId, stock),
    setStatus: (kind: ProductKind, externalId: string, status: string) =>
      call<ProductRecord>('products.setStatus', kind, externalId, status),
    remove: (kind: ProductKind, externalId: string) =>
      call<boolean>('products.remove', kind, externalId),
  },
  points: {
    get: () => call<PointsSnapshot | null>('points.get'),
    sync: (snapshot) => call<PointsSnapshot>('points.sync', snapshot),
    add: (delta, input) => call<PointsSnapshot>('points.add', delta, input),
    spend: (amount, input) => call<PointsSnapshot>('points.spend', amount, input),
    addLot: (input) => call<PointLotRecord>('points.addLot', input),
    listTransactions: (options) => call<PointTransactionRecord[]>('points.listTransactions', options),
    listLots: () => call<PointLotRecord[]>('points.listLots'),
  },
  activities: {
    list: (options) => call('activities.list', options),
    get: (externalId) => call('activities.get', externalId),
    upsert: (input) => call('activities.upsert', input),
    upsertMany: (inputs) => call('activities.upsertMany', inputs),
    sync: (inputs) => call('activities.sync', inputs),
    setProgress: (externalId, current, target) =>
      call('activities.setProgress', externalId, current, target),
    complete: (externalId) => call('activities.complete', externalId),
  } as ActivityApi,
  orders: {
    record: (input) => call('orders.record', input),
    list: (options) => call('orders.list', options),
    update: (idOrExternalId, patch) => call('orders.update', idOrExternalId, patch),
  } as OrderApi,
  notify: {
    send: (options: NotifyOptions) => call('notify.send', options),
    success: (message, payload) =>
      call('notify.send', { body: message, level: 'success', data: payload }),
    fail: (message, payload) =>
      call('notify.send', { body: message, level: 'error', data: payload }),
  },
  artifacts: {
    write: async (name: string, content: string | Uint8Array, options?: ArtifactWriteOptions) => {
      const payload = toArtifactPayload(content);
      return call<ArtifactRecord>(
        'artifacts.write',
        name,
        payload.content,
        payload.encoding,
        options,
      );
    },
    json: async (name: string, value: unknown) => {
      return call<ArtifactRecord>('artifacts.write', name, JSON.stringify(value), 'utf8', {
        contentType: 'application/json',
      });
    },
  },
  crypto: createCryptoApi(),
  state: {
    load: () => call('state.load'),
    save: (value) => call('state.save', value),
  },
  log,
};

const ctx = createScriptContext(host);

function formatArg(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack ?? value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const consoleProxy = {
  log: (...args: unknown[]) => log('info', args.map(formatArg).join(' ')),
  info: (...args: unknown[]) => log('info', args.map(formatArg).join(' ')),
  warn: (...args: unknown[]) => log('warn', args.map(formatArg).join(' ')),
  error: (...args: unknown[]) => log('error', args.map(formatArg).join(' ')),
  debug: (...args: unknown[]) => log('debug', args.map(formatArg).join(' ')),
};

const root = resolve(data.workspaceRoot);
const moduleCache = new Map<string, { exports: unknown }>();

function insideRoot(filePath: string): boolean {
  const rel = relative(root, filePath);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function resolveFile(filePath: string): string {
  const candidates = [filePath];
  if (!extname(filePath)) {
    candidates.push(`${filePath}.js`, `${filePath}.cjs`, `${filePath}.json`);
  }
  for (const candidate of candidates) {
    try {
      if (readFileSync(candidate)) return candidate;
    } catch {
      // try next
    }
  }
  throw new Error(`模块不存在：${filePath}`);
}

function loadModule(filePath: string): unknown {
  const full = resolveFile(resolve(filePath));
  if (!insideRoot(full)) throw new Error('模块路径越界');
  const cached = moduleCache.get(full);
  if (cached) return cached.exports;

  const module = { exports: {} as unknown };
  moduleCache.set(full, module);

  if (full.endsWith('.json')) {
    module.exports = JSON.parse(readFileSync(full, 'utf8'));
    return module.exports;
  }

  const code = readFileSync(full, 'utf8');
  const wrapper = new vm.Script(
    `(function (exports, require, module, __filename, __dirname) {\n${code}\n})`,
    { filename: full },
  );
  const fn = wrapper.runInContext(context, { timeout: 10_000 }) as (
    exports: unknown,
    require: (id: string) => unknown,
    module: { exports: unknown },
    filename: string,
    dirname: string,
  ) => void;
  fn(module.exports, createPlatformRequire(full), module, full, dirname(full));
  return module.exports;
}

const ALLOWED_BUILTINS = new Set([
  'assert',
  'node:assert',
  'buffer',
  'node:buffer',
  'crypto',
  'node:crypto',
  'querystring',
  'node:querystring',
  'url',
  'node:url',
  'util',
  'node:util',
  'zlib',
  'node:zlib',
]);

const sdkModule = require('@free-welfare/sdk') as unknown;

function createPlatformRequire(fromFile: string): (id: string) => unknown {
  return (id: string) => {
    if (id === '@free-welfare/sdk') return sdkModule;
    if (id.startsWith('.') || isAbsolute(id)) {
      return loadModule(resolve(dirname(fromFile), id));
    }
    if (ALLOWED_BUILTINS.has(id)) {
      return createRequire(fromFile)(id);
    }
    throw new Error(`平台模式不允许 require('${id}')`);
  };
}

function qinglongRequire(fromFile: string): (id: string) => unknown {
  const nativeRequire = createRequire(fromFile);
  return (id: string) => nativeRequire(id);
}

const builtins: Record<string, string> = {
  FW_RUN_ID: data.run.id,
  FW_SITE_ID: data.app.id,
  FW_SITE_KEY: data.app.key,
  FW_SITE_NAME: data.app.name,
  FW_SCRIPT_ID: data.run.script.id,
  FW_SCRIPT_NAME: data.run.script.name,
  FW_SCRIPT_VERSION: data.run.script.version,
  FW_CAPABILITY: String(data.run.capability),
  FW_ACCOUNT_ID: data.account.id,
  FW_ACCOUNT_NAME: data.account.displayName,
  FW_YYB_REF: data.account.yybRef,
  FW_DRY_RUN: String(data.run.dryRun),
  FW_TRIGGER: data.run.trigger,
  FW_ARGS: data.args.join(' '),
};

if (data.mode === 'qinglong') {
  Object.assign(process.env, data.env, builtins);
}

const safeProcess = {
  env: { ...data.env, ...builtins },
  platform: process.platform,
  arch: process.arch,
  version: process.version,
  versions: process.versions,
  argv: [process.execPath, data.filename, ...data.args],
  cwd: () => data.workspaceRoot,
};

const context = vm.createContext({
  console: consoleProxy,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  setImmediate,
  clearImmediate,
  queueMicrotask,
  Buffer,
  URL,
  URLSearchParams,
  TextEncoder,
  TextDecoder,
  module: { exports: {} as unknown },
  exports: {} as unknown,
  require: createPlatformRequire(data.filename),
  __filename: data.filename,
  __dirname: dirname(data.filename),
  process: data.mode === 'qinglong' ? process : safeProcess,
  fetch: data.mode === 'qinglong' ? fetch : undefined,
});

// Keep CommonJS aliases pointing at the same object.
(context as Record<string, unknown>).global = context;
(context as Record<string, unknown>).globalThis = context;
(context as Record<string, unknown>).exports = (context as { module: { exports: unknown } }).module.exports;

function loadEntry(): unknown {
  const code = readFileSync(data.filename, 'utf8');
  const wrapper = new vm.Script(
    `(function (exports, require, module, __filename, __dirname) {\n${code}\n})`,
    { filename: data.filename },
  );
  const fn = wrapper.runInContext(context, { timeout: 10_000 }) as (
    exports: unknown,
    require: (id: string) => unknown,
    module: { exports: unknown },
    filename: string,
    dirname: string,
  ) => void;
  const module = { exports: {} as unknown };
  const requireFn =
    data.mode === 'qinglong' ? qinglongRequire(data.filename) : createPlatformRequire(data.filename);
  fn(module.exports, requireFn, module, data.filename, dirname(data.filename));
  return module.exports;
}

function asResult(value: unknown): unknown {
  if (value && typeof value === 'object' && typeof (value as { ok?: unknown }).ok === 'boolean') {
    return value;
  }
  return { ok: true, message: '脚本执行完成', data: value };
}

async function main(): Promise<void> {
  const exported = loadEntry();
  const candidate = exported as
    | { run?: (context: unknown) => unknown; default?: { run?: (context: unknown) => unknown } }
    | ((context: unknown) => unknown)
    | undefined;

  let result: unknown;
  if (typeof candidate === 'function') {
    result = await candidate(ctx);
  } else if (candidate?.run) {
    result = await candidate.run(ctx);
  } else if (candidate?.default?.run) {
    result = await candidate.default.run(ctx);
  } else if (data.mode === 'qinglong') {
    result = { ok: true, message: '青龙脚本执行完成' };
  } else {
    throw new ScriptError('script_invalid', '脚本没有导出 run(ctx)');
  }

  post({ type: 'result', result: asResult(result) });
}

main().catch((error: unknown) => {
  const scriptError = error instanceof ScriptError ? error : null;
  const err = error as { code?: string; message?: string; retryable?: boolean; manual?: boolean; details?: unknown };
  post({
    type: 'error',
    error: {
      code: scriptError?.code ?? err.code ?? 'script_error',
      message: scriptError?.message ?? err.message ?? String(error),
      retryable: scriptError?.retryable ?? err.retryable,
      manual: scriptError?.manual ?? err.manual,
      details: scriptError?.details ?? err.details,
    },
  });
});
