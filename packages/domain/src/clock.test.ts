import { describe, expect, it } from 'vitest';
import {
  defaultClockState,
  parseRemoteTime,
  platformNow,
  readClockState,
} from './clock';

describe('clock', () => {
  it('applies offset to server time', () => {
    const server = new Date('2026-01-01T00:00:00.000Z');
    expect(platformNow(60_000, server).toISOString()).toBe(
      '2026-01-01T00:01:00.000Z',
    );
  });

  it('reads state with defaults', () => {
    expect(readClockState(null)).toEqual(defaultClockState());
    expect(
      readClockState({
        mode: 'manual',
        offsetMs: 1000,
        sourceUrl: 'https://example.com/time',
        syncIntervalSeconds: 10,
      }),
    ).toMatchObject({
      mode: 'manual',
      offsetMs: 1000,
      sourceUrl: 'https://example.com/time',
      syncIntervalSeconds: 30,
    });
  });

  it('parses unix seconds and milliseconds', () => {
    expect(parseRemoteTime('1700000000')?.toISOString()).toBe(
      '2023-11-14T22:13:20.000Z',
    );
    expect(parseRemoteTime('1700000000000')?.toISOString()).toBe(
      '2023-11-14T22:13:20.000Z',
    );
  });

  it('parses JSON time fields', () => {
    expect(parseRemoteTime('{"data":{"timestamp":1700000000}}')?.toISOString()).toBe(
      '2023-11-14T22:13:20.000Z',
    );
    expect(parseRemoteTime('{"unixtime":1700000000}')?.toISOString()).toBe(
      '2023-11-14T22:13:20.000Z',
    );
  });

  it('treats timezone-less datetimes as local time', () => {
    expect(parseRemoteTime('{"dateTime":"2026-11-16T10:00:00"}')?.getTime()).toBe(
      new Date('2026-11-16T10:00:00').getTime(),
    );
  });

  it('falls back to the HTTP Date header', () => {
    expect(
      parseRemoteTime('', 'Mon, 16 Nov 2026 02:00:00 GMT')?.toISOString(),
    ).toBe('2026-11-16T02:00:00.000Z');
  });
});
