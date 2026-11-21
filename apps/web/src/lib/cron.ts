export type CronMode = 'daily' | 'weekly' | 'monthly' | 'interval' | 'hourly' | 'custom';

export interface SimpleCron {
  mode: CronMode;
  minute: number;
  hour: number;
  weekday: number;
  day: number;
  interval: number;
  raw: string;
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function isNumber(value: string) {
  return /^\d+$/.test(value);
}

function numberIn(value: string, min: number, max: number, fallback: number) {
  if (!isNumber(value)) return fallback;
  const number = Number(value);
  return number >= min && number <= max ? number : fallback;
}

function timeLabel(hour: number, minute: number) {
  return `${pad(hour)}:${pad(minute)}`;
}

/** 解析常见 5 段 cron；复杂表达式归入 custom。 */
export function parseCron(expression: string): SimpleCron {
  const raw = String(expression || '').trim();
  const fields = raw.split(/\s+/);
  const base: SimpleCron = {
    mode: 'custom',
    minute: 0,
    hour: 8,
    weekday: 1,
    day: 1,
    interval: 30,
    raw,
  };
  if (fields.length !== 5) return base;

  const [minute, hour, day, month, weekday] = fields;
  const every = minute.match(/^\*\/(\d+)$/);
  if (every && hour === '*' && day === '*' && month === '*' && weekday === '*') {
    return { ...base, mode: 'interval', interval: numberIn(every[1], 1, 59, 30) };
  }
  if (minute === '*' && hour === '*' && day === '*' && month === '*' && weekday === '*') {
    return { ...base, mode: 'interval', interval: 1 };
  }
  if (isNumber(minute) && hour === '*' && day === '*' && month === '*' && weekday === '*') {
    return { ...base, mode: 'hourly', minute: numberIn(minute, 0, 59, 0) };
  }
  if (!isNumber(minute) || !isNumber(hour)) return base;

  const parsedMinute = numberIn(minute, 0, 59, 0);
  const parsedHour = numberIn(hour, 0, 23, 8);
  if (day === '*' && month === '*' && weekday === '*') {
    return { ...base, mode: 'daily', minute: parsedMinute, hour: parsedHour };
  }
  if (day === '*' && month === '*' && isNumber(weekday)) {
    const value = Number(weekday);
    return {
      ...base,
      mode: 'weekly',
      minute: parsedMinute,
      hour: parsedHour,
      weekday: value === 7 ? 0 : numberIn(weekday, 0, 6, 1),
    };
  }
  if (isNumber(day) && month === '*' && weekday === '*') {
    return {
      ...base,
      mode: 'monthly',
      minute: parsedMinute,
      hour: parsedHour,
      day: numberIn(day, 1, 31, 1),
    };
  }
  return base;
}

/** 把 cron 转成人类可读的中文说明。 */
export function describeCron(expression: string): string {
  const value = String(expression || '').trim();
  if (!value) return '未设置定时';
  const parsed = parseCron(value);
  switch (parsed.mode) {
    case 'interval':
      return parsed.interval === 1 ? '每分钟执行' : `每 ${parsed.interval} 分钟执行`;
    case 'hourly':
      return `每小时第 ${parsed.minute} 分执行`;
    case 'daily':
      return `每天 ${timeLabel(parsed.hour, parsed.minute)} 执行`;
    case 'weekly':
      return `每${WEEKDAYS[parsed.weekday]} ${timeLabel(parsed.hour, parsed.minute)} 执行`;
    case 'monthly':
      return `每月 ${parsed.day} 日 ${timeLabel(parsed.hour, parsed.minute)} 执行`;
    default:
      return value.split(/\s+/).length === 5 ? `自定义 cron：${value}` : '自定义 cron（格式不完整）';
  }
}

/** 简单校验：5 段、允许的字符。 */
export function isValidCron(expression: string): boolean {
  const fields = String(expression || '').trim().split(/\s+/);
  if (fields.length !== 5) return false;
  return fields.every((field) => /^[\d*/,\-]+$/.test(field));
}

export { WEEKDAYS };
