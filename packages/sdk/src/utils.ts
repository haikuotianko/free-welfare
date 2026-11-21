import { ScriptError } from './errors';
import type { ConfigApi, EnvApi, RetryOptions } from './types';

declare function setTimeout(callback: () => void, ms?: number): unknown;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function readPath(source: Record<string, unknown>, path: string): unknown {
  if (Object.prototype.hasOwnProperty.call(source, path)) return source[path];
  const parts = path.split('.');
  if (parts.length === 1) return undefined;
  let current: unknown = source;
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function hasPath(source: Record<string, unknown>, path: string): boolean {
  if (Object.prototype.hasOwnProperty.call(source, path)) return true;
  const parts = path.split('.');
  if (parts.length === 1) return false;
  let current: unknown = source;
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return false;
    if (!Object.prototype.hasOwnProperty.call(current, part)) return false;
    current = (current as Record<string, unknown>)[part];
  }
  return true;
}

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off', ''].includes(normalized)) return false;
  }
  return undefined;
}

function toJson<T>(value: unknown): T | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }
  return value as T;
}

export function createConfigApi(values: Record<string, unknown>): ConfigApi {
  return {
    get<T = unknown>(key: string, fallback?: T): T | undefined {
      const value = readPath(values, key);
      return value === undefined ? fallback : (value as T);
    },
    require<T = unknown>(key: string): T {
      const value = readPath(values, key);
      if (value === undefined || value === null || value === '') {
        throw new ScriptError('config_missing', `缺少配置项：${key}`);
      }
      return value as T;
    },
    has(key: string): boolean {
      return hasPath(values, key);
    },
    all(): Record<string, unknown> {
      return { ...values };
    },
    getString(key: string, fallback?: string): string | undefined {
      const value = readPath(values, key);
      return value === undefined || value === null ? fallback : String(value);
    },
    getNumber(key: string, fallback?: number): number | undefined {
      const value = Number(readPath(values, key));
      return Number.isFinite(value) ? value : fallback;
    },
    getBoolean(key: string, fallback?: boolean): boolean | undefined {
      return toBoolean(readPath(values, key)) ?? fallback;
    },
    getJson<T = unknown>(key: string, fallback?: T): T | undefined {
      return toJson<T>(readPath(values, key)) ?? fallback;
    },
  };
}

export function createEnvApi(values: Record<string, string>): EnvApi {
  return {
    get(key: string, fallback?: string): string | undefined {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : fallback;
    },
    require(key: string): string {
      const value = values[key];
      if (value === undefined || value === '') {
        throw new ScriptError('env_missing', `缺少环境变量：${key}`);
      }
      return value;
    },
    has(key: string): boolean {
      return Object.prototype.hasOwnProperty.call(values, key);
    },
    all(): Record<string, string> {
      return { ...values };
    },
    getNumber(key: string, fallback?: number): number | undefined {
      const value = Number(values[key]);
      return Number.isFinite(value) ? value : fallback;
    },
    getBoolean(key: string, fallback?: boolean): boolean | undefined {
      return toBoolean(values[key]) ?? fallback;
    },
    getJson<T = unknown>(key: string, fallback?: T): T | undefined {
      return toJson<T>(values[key]) ?? fallback;
    },
  };
}

export async function retry<T>(fn: () => Promise<T> | T, options: RetryOptions = {}): Promise<T> {
  const retries = Math.max(0, options.retries ?? 2);
  const initialDelay = Math.max(0, options.delayMs ?? 500);
  const backoff = Math.max(1, options.backoff ?? 2);
  const maxDelay = Math.max(initialDelay, options.maxDelayMs ?? 10_000);

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      if (attempt > retries) throw error;
      const allowed = options.shouldRetry
        ? options.shouldRetry(error, attempt)
        : !(error instanceof ScriptError) || error.retryable;
      if (!allowed) throw error;
      const delay = Math.min(maxDelay, initialDelay * Math.pow(backoff, attempt - 1));
      options.onRetry?.(error, attempt, delay);
      await sleep(delay);
    }
  }
}
