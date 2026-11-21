export type ClockMode = 'auto' | 'manual';

export interface ClockState {
  mode: ClockMode;
  offsetMs: number;
  sourceUrl: string;
  syncIntervalSeconds: number;
  lastSyncedAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  lastRemoteTime: string | null;
  manualTime: string | null;
}

export const CLOCK_SETTING_KEY = 'clock.state';
export const CLOCK_TIMEZONE =
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export function defaultClockState(): ClockState {
  return {
    mode: 'auto',
    offsetMs: 0,
    sourceUrl: '',
    syncIntervalSeconds: 300,
    lastSyncedAt: null,
    lastAttemptAt: null,
    lastError: null,
    lastRemoteTime: null,
    manualTime: null,
  };
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function readClockState(value: unknown): ClockState {
  const defaults = defaultClockState();
  const input =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const mode = input.mode === 'manual' ? 'manual' : 'auto';
  const offset = finiteNumber(input.offsetMs);
  const interval = finiteNumber(input.syncIntervalSeconds);
  return {
    mode,
    offsetMs: offset === null ? 0 : Math.trunc(offset),
    sourceUrl: typeof input.sourceUrl === 'string' ? input.sourceUrl : '',
    syncIntervalSeconds:
      interval === null ? defaults.syncIntervalSeconds : Math.max(30, Math.trunc(interval)),
    lastSyncedAt:
      typeof input.lastSyncedAt === 'string' ? input.lastSyncedAt : null,
    lastAttemptAt:
      typeof input.lastAttemptAt === 'string' ? input.lastAttemptAt : null,
    lastError: typeof input.lastError === 'string' ? input.lastError : null,
    lastRemoteTime:
      typeof input.lastRemoteTime === 'string' ? input.lastRemoteTime : null,
    manualTime: typeof input.manualTime === 'string' ? input.manualTime : null,
  };
}

/** 平台当前时间 = 服务器时间 + 时钟偏移。 */
export function platformNow(offsetMs: number, serverNow: Date = new Date()): Date {
  return new Date(serverNow.getTime() + (Number.isFinite(offsetMs) ? offsetMs : 0));
}

function numericDate(value: number): Date | null {
  if (!Number.isFinite(value)) return null;
  const milliseconds = value > 1e12 ? value : value * 1000;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateValue(value: unknown): Date | null {
  if (typeof value === 'number') return numericDate(value);
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  if (/^\d+(\.\d+)?$/.test(text)) return numericDate(Number(text));

  // 没有时区的时间按服务器本地时间解释。
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)
    ? text
    : /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(text)
      ? text.replace(' ', 'T')
      : text;
  const date = new Date(withZone);
  return Number.isNaN(date.getTime()) ? null : date;
}

const TIME_KEYS = [
  'timestamp',
  'unixtime',
  'unixTime',
  'time',
  'now',
  'serverTime',
  'server_time',
  'currentTime',
  'current_time',
  'dateTime',
  'datetime',
  'utc_datetime',
  'utcDatetime',
  'iso',
  'date',
];

function findTime(value: unknown, depth: number): Date | null {
  if (depth > 5) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTime(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  for (const key of TIME_KEYS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      const found = dateValue(record[key]);
      if (found) return found;
    }
  }
  for (const key of ['data', 'result', 'server', 'payload', 'response']) {
    if (record[key] !== undefined) {
      const found = findTime(record[key], depth + 1);
      if (found) return found;
    }
  }
  for (const child of Object.values(record)) {
    if (child && typeof child === 'object') {
      const found = findTime(child, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 解析时间同步接口：
 * - 纯数字时间戳（秒/毫秒）
 * - ISO/日期字符串
 * - JSON 时间字段（timestamp/time/now/dateTime/unixtime...）
 * - HTTP Date 头兜底
 */
export function parseRemoteTime(
  body: string,
  dateHeader?: string | null,
): Date | null {
  const text = String(body ?? '').trim();
  if (text) {
    if (text.startsWith('{') || text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        const found = findTime(parsed, 0);
        if (found) return found;
      } catch {
        // fall through to text/header
      }
    }
    const direct = dateValue(text);
    if (direct) return direct;
  }
  if (dateHeader) {
    const header = new Date(dateHeader);
    if (!Number.isNaN(header.getTime())) return header;
  }
  return null;
}
