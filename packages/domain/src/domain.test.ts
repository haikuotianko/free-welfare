import { describe, expect, it } from 'vitest';
import { allocateFifo } from './points';
import { checkUrlAllowed, isPrivateHost } from './network';

describe('isPrivateHost', () => {
  it('rejects loopback and private ranges', () => {
    expect(isPrivateHost('localhost')).toBe(true);
    expect(isPrivateHost('127.0.0.1')).toBe(true);
    expect(isPrivateHost('10.1.2.3')).toBe(true);
    expect(isPrivateHost('192.168.1.10')).toBe(true);
    expect(isPrivateHost('169.254.169.254')).toBe(true);
    expect(isPrivateHost('::1')).toBe(true);
  });

  it('allows public hosts', () => {
    expect(isPrivateHost('api.example.com')).toBe(false);
    expect(isPrivateHost('8.8.8.8')).toBe(false);
  });
});

describe('checkUrlAllowed', () => {
  const policy = {
    mode: 'whitelist' as const,
    rules: [{ origin: 'https://api.example.com' }, { origin: 'https://api2.example.com', pathPrefix: '/v1' }],
  };

  it('allows exact whitelist origin', () => {
    expect(checkUrlAllowed('https://api.example.com/status', policy).allowed).toBe(true);
  });

  it('allows path prefix', () => {
    expect(checkUrlAllowed('https://api2.example.com/v1/foo', policy).allowed).toBe(true);
    expect(checkUrlAllowed('https://api2.example.com/v2/foo', policy).allowed).toBe(false);
  });

  it('blocks non-whitelisted and private hosts', () => {
    expect(checkUrlAllowed('https://evil.example.com', policy).allowed).toBe(false);
    expect(checkUrlAllowed('http://127.0.0.1:3000', policy).allowed).toBe(false);
  });
});

describe('allocateFifo', () => {
  it('spends earliest expiry first', () => {
    const result = allocateFifo(
      [
        { id: 'b', remaining: 10, expiresAt: new Date('2027-01-01') },
        { id: 'a', remaining: 5, expiresAt: new Date('2026-01-01') },
        { id: 'c', remaining: 10, expiresAt: null },
      ],
      12,
    );
    expect(result.used).toBe(12);
    expect(result.remaining).toBe(0);
    expect(result.allocations).toEqual([
      { id: 'a', amount: 5 },
      { id: 'b', amount: 7 },
    ]);
  });
});
