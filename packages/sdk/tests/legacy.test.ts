import { describe, expect, it, vi } from 'vitest';
import { createLegacyAdapter } from '../src/legacy';
import type { ScriptContext } from '../src/types';

function createCtx() {
  const request = vi.fn().mockResolvedValue({
    status: 200,
    ok: true,
    headers: { 'content-type': 'application/json' },
    data: { ok: true },
  });
  const cache = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(true),
  };
  const ctx = {
    account: { yybRef: '1234567890123456', displayName: '测试账号' },
    http: { request },
    yyb: { getCode: vi.fn().mockResolvedValue('wx-code') },
    cache,
    sleep: vi.fn().mockResolvedValue(undefined),
  } as unknown as ScriptContext;
  return { ctx, request, cache };
}

describe('createLegacyAdapter', () => {
  it('maps legacy requests to ctx.http', async () => {
    const { ctx, request } = createCtx();
    const adapter = createLegacyAdapter(ctx);

    const result = await adapter.request({
      method: 'post',
      baseURL: 'https://api.example.com',
      path: '/login',
      token: 'abc',
      body: { code: 'x' },
      query: { page: 1 },
    });

    expect(result.data).toEqual({ ok: true });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        baseURL: 'https://api.example.com',
        url: '/login',
        headers: { Authorization: 'abc' },
        query: { page: 1 },
        json: { code: 'x' },
        responseType: 'json',
      }),
    );
  });

  it('uses current account, yyb code and account cache', async () => {
    const { ctx, cache } = createCtx();
    const adapter = createLegacyAdapter(ctx);

    expect(adapter.account.ref).toBe('1234567890123456');
    expect(adapter.label()).toContain('1234***3456');
    await expect(adapter.getCode({ appId: 'wx123' })).resolves.toBe('wx-code');
    expect(ctx.yyb.getCode).toHaveBeenCalledWith({ appId: 'wx123' });

    await expect(adapter.cacheGet('auth', { token: '' })).resolves.toEqual({ token: '' });
    await adapter.cacheSet('auth', { token: 't' }, 60);
    expect(cache.set).toHaveBeenCalledWith('auth', { token: 't' }, 60);
  });
});
