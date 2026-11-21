import { describe, expect, it } from 'vitest';
import { createConfigApi, createEnvApi, retry, ScriptError } from '../src';

describe('config api', () => {
  it('reads nested values and falls back', () => {
    const config = createConfigApi({
      apiBase: 'https://api.example.com',
      login: { retries: 3, debug: true },
    });
    expect(config.getString('apiBase')).toBe('https://api.example.com');
    expect(config.get('login.retries')).toBe(3);
    expect(config.getNumber('login.retries')).toBe(3);
    expect(config.getBoolean('login.debug')).toBe(true);
    expect(config.get('missing', 'fallback')).toBe('fallback');
    expect(config.has('login.retries')).toBe(true);
  });

  it('requires non-empty values', () => {
    const config = createConfigApi({ empty: '', value: 1 });
    expect(config.require('value')).toBe(1);
    expect(() => config.require('empty')).toThrow(ScriptError);
  });
});

describe('env api', () => {
  it('parses booleans, numbers and json', () => {
    const env = createEnvApi({
      DEBUG: 'true',
      PORT: '3000',
      CONFIG: '{"a":1}',
    });
    expect(env.get('DEBUG')).toBe('true');
    expect(env.getBoolean('DEBUG')).toBe(true);
    expect(env.getNumber('PORT')).toBe(3000);
    expect(env.getJson<{ a: number }>('CONFIG')).toEqual({ a: 1 });
    expect(env.has('MISSING')).toBe(false);
  });
});

describe('retry', () => {
  it('retries and succeeds', async () => {
    let attempts = 0;
    const result = await retry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error('temporary');
        return 'ok';
      },
      { retries: 3, delayMs: 1 },
    );
    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('does not retry non-retryable script errors', async () => {
    let attempts = 0;
    await expect(
      retry(
        async () => {
          attempts += 1;
          throw new ScriptError('business', 'stop');
        },
        { retries: 3, delayMs: 1 },
      ),
    ).rejects.toThrow('stop');
    expect(attempts).toBe(1);
  });
});
