import type { HttpMethod, HttpResponseType, ScriptContext } from './types';

/**
 * 旧青龙脚本迁移辅助。
 *
 * 平台原生脚本应直接使用 `ctx.http` / `ctx.yyb` / `ctx.cache`。
 * 这个适配器把常见的青龙写法（path/baseURL + token + JSON）映射到平台 API，
 * 让已有脚本可以一次改少量代码完成迁移。
 */

export interface LegacyAccount {
  ref: string;
  remark: string;
}

export interface LegacyRequestOptions {
  method?: string;
  /** 相对路径，配合 baseURL 使用。 */
  path?: string;
  /** 完整 URL；和 path 二选一。 */
  url?: string;
  baseURL?: string;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | null | undefined>;
  /** JSON 请求体。 */
  body?: unknown;
  /** 原始字符串请求体；和 body 二选一。 */
  rawBody?: string;
  /** 便捷 token，默认放到 Authorization。 */
  token?: string;
  tokenHeader?: string;
  timeoutMs?: number;
  responseType?: HttpResponseType;
  acceptedStatus?: number[];
}

export interface LegacyHttpResponse<T = unknown> {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  /** 原始 Set-Cookie 列表；headers['set-cookie'] 可能只剩最后一条。 */
  setCookies?: string[];
  data: T;
  text?: string;
}

export interface LegacyAdapter {
  ctx: ScriptContext;
  account: LegacyAccount;
  label(): string;
  request<T = unknown>(options: LegacyRequestOptions): Promise<LegacyHttpResponse<T>>;
  requestJson<T = unknown>(options: LegacyRequestOptions): Promise<T>;
  getCode(options?: { appId?: string }): Promise<string>;
  cacheGet<T>(key: string, fallback: T): Promise<T>;
  cacheSet(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  cacheDelete(key: string): Promise<boolean>;
  maskRef(ref?: string | null): string;
  sleep(ms: number): Promise<void>;
}

export function maskRef(ref?: string | null): string {
  const value = String(ref || '');
  return value.length <= 10 ? value : `${value.slice(0, 4)}***${value.slice(-4)}`;
}

export function createLegacyAdapter(ctx: ScriptContext): LegacyAdapter {
  const account: LegacyAccount = {
    ref: ctx.account.yybRef,
    remark: ctx.account.displayName || '',
  };

  const label = () => {
    const remark = account.remark ? `[${account.remark}] ` : '';
    return `${remark}${maskRef(account.ref)}`;
  };

  const request = async <T = unknown>(
    options: LegacyRequestOptions,
  ): Promise<LegacyHttpResponse<T>> => {
    const headers: Record<string, string> = { ...(options.headers || {}) };
    if (options.token) {
      headers[options.tokenHeader || 'Authorization'] = options.token;
    }

    const method = String(options.method || 'GET').toUpperCase() as HttpMethod;
    const response = await ctx.http.request<T>({
      method,
      baseURL: options.baseURL,
      url: options.url || options.path || '/',
      headers,
      query: options.query,
      json: options.rawBody === undefined ? options.body : undefined,
      body: options.rawBody,
      responseType: options.responseType ?? 'json',
      timeoutMs: options.timeoutMs ?? 20000,
      followRedirects: true,
      acceptedStatus:
        options.acceptedStatus ?? [200, 201, 202, 204, 400, 401, 403, 404, 409, 429, 500, 502, 503, 504],
    });

    return {
      status: response.status,
      ok: response.ok,
      headers: response.headers || {},
      setCookies: response.setCookies,
      data: response.data as T,
      text: response.text,
    };
  };

  return {
    ctx,
    account,
    label,
    request,
    requestJson: async <T = unknown>(options: LegacyRequestOptions) => {
      const response = await request<T>(options);
      return response.data;
    },
    getCode: (options) => ctx.yyb.getCode(options ? { appId: options.appId } : undefined),
    cacheGet: async <T>(key: string, fallback: T) => {
      const value = await ctx.cache.get<T>(key);
      return value === null || value === undefined ? fallback : value;
    },
    cacheSet: (key, value, ttlSeconds) => ctx.cache.set(key, value, ttlSeconds),
    cacheDelete: (key) => ctx.cache.delete(key),
    maskRef,
    sleep: (ms) => ctx.sleep(ms),
  };
}
