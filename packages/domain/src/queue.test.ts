import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUEUE_CONFIG,
  effectiveRunTimeoutMinutes,
  readQueueConfig,
} from './queue';

describe('readQueueConfig', () => {
  it('uses defaults for missing or invalid values', () => {
    expect(readQueueConfig(null)).toEqual(DEFAULT_QUEUE_CONFIG);
    expect(readQueueConfig({ concurrency: 'abc' })).toEqual(DEFAULT_QUEUE_CONFIG);
  });

  it('clamps values into the supported range', () => {
    const config = readQueueConfig({
      concurrency: 999,
      perAccountConcurrency: 0,
      perSiteConcurrency: -3,
      runTimeoutMinutes: 0,
      maxQueueSize: 12_345,
    });
    expect(config).toEqual({
      concurrency: 20,
      perAccountConcurrency: 1,
      perSiteConcurrency: 0,
      runTimeoutMinutes: 1,
      maxQueueSize: 1000,
      runMissedSchedules: true,
    });
  });

  it('truncates decimals', () => {
    expect(readQueueConfig({ concurrency: 2.9, runTimeoutMinutes: 10.8 })).toMatchObject({
      concurrency: 2,
      runTimeoutMinutes: 10,
    });
  });
});

describe('effectiveRunTimeoutMinutes', () => {
  it('prefers the site override and falls back to the system value', () => {
    expect(effectiveRunTimeoutMinutes(5, 2)).toBe(5);
    expect(effectiveRunTimeoutMinutes(null, 2)).toBe(2);
    expect(effectiveRunTimeoutMinutes(undefined, 2)).toBe(2);
  });
});
