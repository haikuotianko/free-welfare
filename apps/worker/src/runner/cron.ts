const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_SEARCH_MINUTES = 366 * 24 * 60;

function parseNumber(value: string, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`cron 数值越界：${value}（${min}-${max}）`);
  }
  return number;
}

function parseField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();
  for (const part of field.split(',')) {
    const [range, stepRaw] = part.trim().split('/');
    const step = stepRaw === undefined ? 1 : parseNumber(stepRaw, 1, Math.max(1, max - min + 1));
    let start: number;
    let end: number;
    if (range === '*') {
      start = min;
      end = max;
    } else if (range.includes('-')) {
      const [a, b] = range.split('-');
      start = parseNumber(a, min, max);
      end = parseNumber(b, min, max);
    } else {
      start = parseNumber(range, min, max);
      end = start;
    }
    for (let value = start; value <= end; value += step) values.add(value);
  }
  if (values.size === 0) throw new Error(`cron 字段为空：${field}`);
  return values;
}

function parseCron(expression: string) {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error('cron 需要 5 段：分 时 日 月 周');
  const [minute, hour, day, month, weekday] = fields;
  const weekdays = parseField(weekday, 0, 7);
  if (weekdays.has(7)) {
    weekdays.delete(7);
    weekdays.add(0);
  }
  return {
    minutes: parseField(minute, 0, 59),
    hours: parseField(hour, 0, 23),
    days: parseField(day, 1, 31),
    months: parseField(month, 1, 12),
    weekdays,
  };
}

function partsInZone(date: Date, formatter: Intl.DateTimeFormat) {
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) parts[part.type] = part.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAYS.indexOf(parts.weekday),
  };
}

export function nextCronTime(
  expression: string,
  from: Date,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
): Date {
  const cron = parseCron(expression);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  });
  // Validate the time zone before searching.
  formatter.format(from);

  let cursor = new Date(Math.floor(from.getTime() / 60_000) * 60_000 + 60_000);
  for (let i = 0; i < MAX_SEARCH_MINUTES; i += 1) {
    const parts = partsInZone(cursor, formatter);
    if (
      cron.months.has(parts.month) &&
      cron.days.has(parts.day) &&
      cron.weekdays.has(parts.weekday) &&
      cron.hours.has(parts.hour) &&
      cron.minutes.has(parts.minute)
    ) {
      return cursor;
    }
    cursor = new Date(cursor.getTime() + 60_000);
  }
  throw new Error('cron 一年内没有匹配时间');
}
