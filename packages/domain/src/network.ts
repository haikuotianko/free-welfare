import type { NetworkMode } from '@free-welfare/shared';

export interface NetworkRule {
  origin: string;
  pathPrefix?: string;
}

export interface NetworkPolicy {
  mode: NetworkMode;
  rules: NetworkRule[];
  allowPorts?: number[];
}

export interface NetworkDecision {
  allowed: boolean;
  reason?: string;
  origin?: string;
}

const DEFAULT_PORTS = [80, 443];

function parseIPv4(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === 'metadata.google.internal'
  ) {
    return true;
  }

  const v4 = parseIPv4(host);
  if (v4) {
    const [a, b] = v4;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true;
    return false;
  }

  // IPv6 loopback / unspecified / ULA / link-local / multicast.
  if (host === '::1' || host === '::') return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(host)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(host)) return true;
  if (/^ff[0-9a-f]{2}:/i.test(host)) return true;
  if (host.startsWith('::ffff:')) {
    const mapped = host.slice('::ffff:'.length);
    const inner = parseIPv4(mapped);
    if (inner) {
      const [a, b] = inner;
      return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168)
      );
    }
  }

  return false;
}

export function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function matchesRule(url: URL, rule: NetworkRule): boolean {
  const ruleOrigin = normalizeOrigin(rule.origin);
  if (!ruleOrigin || ruleOrigin !== url.origin) return false;
  if (!rule.pathPrefix) return true;
  const prefix = rule.pathPrefix.startsWith('/') ? rule.pathPrefix : `/${rule.pathPrefix}`;
  return url.pathname === prefix || url.pathname.startsWith(`${prefix}/`);
}

export function checkUrlAllowed(value: string, policy: NetworkPolicy): NetworkDecision {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { allowed: false, reason: 'invalid_url' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { allowed: false, reason: 'invalid_protocol' };
  }
  if (url.username || url.password) {
    return { allowed: false, reason: 'credentials_in_url' };
  }
  if (isPrivateHost(url.hostname)) {
    return { allowed: false, reason: 'private_host' };
  }

  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  const ports = policy.allowPorts ?? DEFAULT_PORTS;
  if (!ports.includes(port)) {
    return { allowed: false, reason: 'port_not_allowed', origin: url.origin };
  }

  if (policy.mode === 'unrestricted') {
    return { allowed: true, origin: url.origin };
  }

  const allowed = policy.rules.some((rule) => matchesRule(url, rule));
  return allowed
    ? { allowed: true, origin: url.origin }
    : { allowed: false, reason: 'not_in_whitelist', origin: url.origin };
}
