import { ScriptError, scriptErrors } from './errors';
import type { ScriptHost } from './host';
import type {
  AccountApi,
  ActivityApi,
  CacheApi,
  CacheScope,
  ConfigApi,
  EnvApi,
  HttpClient,
  HttpRequestOptions,
  HttpResponse,
  Logger,
  LogLevel,
  NotifyApi,
  OrderApi,
  ProductApi,
  ProductKind,
  RetryOptions,
  ScriptContext,
  ScriptErrorOptions,
  StateApi,
  TimeApi,
} from './types';
import { createConfigApi, createEnvApi, retry, sleep } from './utils';

interface NormalizedRetry {
  retries: number;
  delayMs: number;
  backoff: number;
  maxDelayMs: number;
  retryOnStatus: number[];
}

function normalizeRetry(input: HttpRequestOptions['retry']): NormalizedRetry | null {
  if (input === undefined) return null;
  const value = typeof input === 'number' ? { retries: input } : input;
  return {
    retries: Math.max(0, value.retries ?? 0),
    delayMs: Math.max(0, value.delayMs ?? 500),
    backoff: Math.max(1, value.backoff ?? 2),
    maxDelayMs: Math.max(0, value.maxDelayMs ?? 10_000),
    retryOnStatus: value.retryOnStatus ?? [408, 425, 429, 500, 502, 503, 504],
  };
}

function retryDelay(options: NormalizedRetry, attempt: number): number {
  return Math.min(options.maxDelayMs, options.delayMs * Math.pow(options.backoff, attempt - 1));
}

function createLogger(host: ScriptHost, fields: Record<string, unknown> = {}): Logger {
  const emit = (level: LogLevel, message: string, data?: unknown) => {
    const payload =
      Object.keys(fields).length === 0
        ? data
        : data === undefined
          ? { ...fields }
          : { ...fields, data };
    host.log(level, message, payload);
  };
  return {
    debug: (message, data) => emit('debug', message, data),
    info: (message, data) => emit('info', message, data),
    warn: (message, data) => emit('warn', message, data),
    error: (message, data) => emit('error', message, data),
    success: (message, data) => emit('info', message, data),
    step: (message, data) => emit('info', `[步骤] ${message}`, data),
    progress: (current, total, message) => {
      const safeTotal = Math.max(1, total);
      const safeCurrent = Math.max(0, Math.min(current, safeTotal));
      emit(message ? 'info' : 'debug', message ?? '进度', {
        progress: {
          current: safeCurrent,
          total: safeTotal,
          percent: Math.round((safeCurrent / safeTotal) * 100),
        },
      });
    },
    child: (extra) => createLogger(host, { ...fields, ...extra }),
  };
}

function createCache(host: ScriptHost, scope: CacheScope): CacheApi {
  const api: CacheApi = {
    get<T = unknown>(key: string): Promise<T | null> {
      return host.cache.get(scope, key) as Promise<T | null>;
    },
    set(key, value, ttlSeconds) {
      return host.cache.set(scope, key, value, ttlSeconds);
    },
    delete(key) {
      return host.cache.delete(scope, key);
    },
    has(key) {
      return host.cache.has(scope, key);
    },
    async remember<T>(key: string, ttlSeconds: number | undefined, factory: () => Promise<T> | T): Promise<T> {
      const cached = await api.get<T>(key);
      if (cached !== null && cached !== undefined) return cached;
      const value = await factory();
      await api.set(key, value, ttlSeconds);
      return value;
    },
    increment(key, by, ttlSeconds) {
      return host.cache.increment(scope, key, by, ttlSeconds);
    },
    touch(key, ttlSeconds) {
      return host.cache.touch(scope, key, ttlSeconds);
    },
    clear() {
      return host.cache.clear(scope);
    },
    scope(next: CacheScope): CacheApi {
      return createCache(host, next);
    },
  };
  return api;
}

function createHttpClient(host: ScriptHost): HttpClient {
  const request = async <T = unknown>(options: HttpRequestOptions): Promise<HttpResponse<T>> => {
    const retryOptions = normalizeRetry(options.retry);
    const retries = retryOptions?.retries ?? 0;
    let attempt = 0;

    for (;;) {
      try {
        const response = (await host.http.request(options)) as HttpResponse<T>;
        if (
          retryOptions &&
          !response.ok &&
          attempt < retries &&
          retryOptions.retryOnStatus.includes(response.status)
        ) {
          attempt += 1;
          await sleep(retryDelay(retryOptions, attempt));
          continue;
        }
        return response;
      } catch (error) {
        if (attempt >= retries) throw error;
        if (error instanceof ScriptError && !error.retryable) throw error;
        attempt += 1;
        await sleep(retryDelay(retryOptions as NormalizedRetry, attempt));
      }
    }
  };

  return {
    request,
    get: <T = unknown>(url: string, options?: Omit<HttpRequestOptions, 'url' | 'method'>) =>
      request<T>({ ...options, method: 'GET', url }),
    post: <T = unknown>(url: string, options?: Omit<HttpRequestOptions, 'url' | 'method'>) =>
      request<T>({ ...options, method: 'POST', url }),
    put: <T = unknown>(url: string, options?: Omit<HttpRequestOptions, 'url' | 'method'>) =>
      request<T>({ ...options, method: 'PUT', url }),
    patch: <T = unknown>(url: string, options?: Omit<HttpRequestOptions, 'url' | 'method'>) =>
      request<T>({ ...options, method: 'PATCH', url }),
    delete: <T = unknown>(url: string, options?: Omit<HttpRequestOptions, 'url' | 'method'>) =>
      request<T>({ ...options, method: 'DELETE', url }),
    head: <T = unknown>(url: string, options?: Omit<HttpRequestOptions, 'url' | 'method'>) =>
      request<T>({ ...options, method: 'HEAD', url }),
    async json<T = unknown>(url: string, options?: Omit<HttpRequestOptions, 'url' | 'method'>): Promise<T> {
      const response = await request<T>({ ...options, method: 'GET', url, responseType: 'json' });
      return response.data as T;
    },
    getJson<T = unknown>(url: string, options?: Omit<HttpRequestOptions, 'url' | 'method'>): Promise<T> {
      return this.json<T>(url, options);
    },
    async postJson<T = unknown>(
      url: string,
      body: unknown,
      options?: Omit<HttpRequestOptions, 'url' | 'method' | 'json'>,
    ): Promise<T> {
      const response = await request<T>({
        ...options,
        method: 'POST',
        url,
        json: body,
        responseType: 'json',
      });
      return response.data as T;
    },
  };
}

function createProducts(host: ScriptHost, kind: ProductKind): ProductApi {
  return {
    list: (options) => host.products.list(kind, options),
    get: (externalId) => host.products.get(kind, externalId),
    upsert: (input) => host.products.upsert(kind, input),
    upsertMany: (inputs) => host.products.upsertMany(kind, inputs),
    sync: (inputs, options) => host.products.sync(kind, inputs, options),
    update: (externalId, patch) => host.products.update(kind, externalId, patch),
    setStock: (externalId, stock) => host.products.setStock(kind, externalId, stock),
    setStatus: (externalId, status) => host.products.setStatus(kind, externalId, status),
    remove: (externalId) => host.products.remove(kind, externalId),
  };
}

function createState(host: ScriptHost): StateApi {
  let loaded: Promise<Record<string, unknown>> | null = null;
  const load = () => {
    loaded ??= host.state.load();
    return loaded;
  };
  return {
    async get<T = unknown>(key: string, fallback?: T): Promise<T | undefined> {
      const all = await load();
      return Object.prototype.hasOwnProperty.call(all, key) ? (all[key] as T) : fallback;
    },
    async set(key, value) {
      const all = await load();
      all[key] = value;
      await host.state.save(all);
    },
    async delete(key) {
      const all = await load();
      delete all[key];
      await host.state.save(all);
    },
    all: () => load(),
  };
}

function assertCondition(
  condition: unknown,
  message: string,
  code = 'assertion_failed',
): asserts condition {
  if (!condition) throw new ScriptError(code, message);
}

function splitArgs(input?: string): string[] {
  return (
    String(input ?? '')
      .match(/(?:[^\s"]+|"[^"]*")+/g)
      ?.map((item) => item.replace(/^"|"$/g, '')) ?? []
  );
}

function fail(code: string, message: string, options?: ScriptErrorOptions): never {
  throw new ScriptError(code, message, options);
}

function createNotify(host: ScriptHost): NotifyApi {
  return {
    send: (options) => host.notify.send(options),
    success: (message, data) =>
      host.notify.send({ body: message, level: 'success', data }),
    fail: (message, data) => host.notify.send({ body: message, level: 'error', data }),
  };
}

export function createScriptContext(host: ScriptHost): ScriptContext {
  const config: ConfigApi = createConfigApi(host.config);
  const appConfig: ConfigApi = createConfigApi(host.appConfig);
  const env: EnvApi = createEnvApi(host.env);
  const app = { ...host.app, config: appConfig, env };
  const account: AccountApi = {
    ...host.account,
    session: host.session,
    refresh: () => host.refreshAccount(),
  };
  const logger = createLogger(host);
  const cache = createCache(host, 'account');
  const http = createHttpClient(host);
  const time: TimeApi = {
    now: () => new Date(Date.now() + host.offsetMs),
    timestamp: () => Date.now() + host.offsetMs,
    iso: () => new Date(Date.now() + host.offsetMs).toISOString(),
    offsetMs: host.offsetMs,
    sleep,
    async sleepUntil(target: Date | string | number): Promise<void> {
      const value =
        target instanceof Date
          ? target.getTime()
          : typeof target === 'number'
            ? target
            : Date.parse(target);
      if (!Number.isFinite(value)) throw new ScriptError('invalid_time', `时间格式不合法：${target}`);
      await sleep(Math.max(0, value - (Date.now() + host.offsetMs)));
    },
  };

  return {
    run: host.run,
    runId: host.run.id,
    dryRun: host.run.dryRun,
    args: splitArgs(host.run.script.args),
    input: host.input ?? {},
    app,
    site: app,
    account,
    session: host.session,
    user: host.user,
    yyb: host.yyb,
    http,
    cache,
    log: logger,
    crypto: host.crypto,
    env,
    config,
    products: createProducts(host, 'product'),
    grab: createProducts(host, 'grab'),
    points: host.points,
    activities: host.activities as ActivityApi,
    orders: host.orders as OrderApi,
    notify: createNotify(host),
    artifacts: host.artifacts,
    state: createState(host),
    time,
    sleep,
    retry: <T>(fn: () => Promise<T> | T, options?: RetryOptions) => retry(fn, options),
    assert: assertCondition,
    fail,
    businessError: (code, message, options) => new ScriptError(code, message, options),
    authExpired: (message, options) => new ScriptError('auth_expired', message, { ...options, manual: true }),
    manualRequired: (message, options) =>
      new ScriptError('manual_required', message, { ...options, manual: true }),
  };
}
