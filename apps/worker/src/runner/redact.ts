const MOBILE = /\b1[3-9]\d{9}\b/g;
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const SENSITIVE_KEY =
  /token|secret|password|cookie|authorization|session|openid|phone|mobile|(^|_)sid($|_)/i;

export function redactText(text: string): string {
  return String(text)
    .replace(MOBILE, (value) => `${value.slice(0, 3)}****${value.slice(7)}`)
    .replace(JWT, '***JWT***');
}

export function redactValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 4) return '[truncated]';
  if (typeof value === 'string') return redactText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redactValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
      result[key] = SENSITIVE_KEY.test(key) ? '***' : redactValue(item, depth + 1);
    }
    return result;
  }
  return redactText(String(value));
}
