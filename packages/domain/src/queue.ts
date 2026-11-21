export const QUEUE_SETTING_KEY = 'queue.config';

export interface QueueConfig {
  /** 全局同时执行数量。 */
  concurrency: number;
  /** 单个微信账号同时执行数量。 */
  perAccountConcurrency: number;
  /** 同一个应用同时执行数量；0 表示不限。 */
  perSiteConcurrency: number;
  /** 脚本最长运行时间（分钟）；应用可单独覆盖。 */
  runTimeoutMinutes: number;
  /** 最大等待队列长度；0 表示不限。 */
  maxQueueSize: number;
  /** worker 启动时是否补跑停机期间错过的定时任务；只在启动时检查一次。 */
  runMissedSchedules: boolean;
}

export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  concurrency: 1,
  perAccountConcurrency: 1,
  perSiteConcurrency: 1,
  runTimeoutMinutes: 2,
  maxQueueSize: 0,
  runMissedSchedules: true,
};

const LIMITS = {
  concurrency: [1, 20],
  perAccountConcurrency: [1, 10],
  perSiteConcurrency: [0, 10],
  runTimeoutMinutes: [1, 1440],
  maxQueueSize: [0, 1000],
} as const;

function integer(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export function readQueueConfig(value: unknown): QueueConfig {
  const input =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    concurrency: integer(
      input.concurrency,
      DEFAULT_QUEUE_CONFIG.concurrency,
      LIMITS.concurrency[0],
      LIMITS.concurrency[1],
    ),
    perAccountConcurrency: integer(
      input.perAccountConcurrency,
      DEFAULT_QUEUE_CONFIG.perAccountConcurrency,
      LIMITS.perAccountConcurrency[0],
      LIMITS.perAccountConcurrency[1],
    ),
    perSiteConcurrency: integer(
      input.perSiteConcurrency,
      DEFAULT_QUEUE_CONFIG.perSiteConcurrency,
      LIMITS.perSiteConcurrency[0],
      LIMITS.perSiteConcurrency[1],
    ),
    runTimeoutMinutes: integer(
      input.runTimeoutMinutes,
      DEFAULT_QUEUE_CONFIG.runTimeoutMinutes,
      LIMITS.runTimeoutMinutes[0],
      LIMITS.runTimeoutMinutes[1],
    ),
    maxQueueSize: integer(
      input.maxQueueSize,
      DEFAULT_QUEUE_CONFIG.maxQueueSize,
      LIMITS.maxQueueSize[0],
      LIMITS.maxQueueSize[1],
    ),
    runMissedSchedules:
      typeof input.runMissedSchedules === 'boolean'
        ? input.runMissedSchedules
        : DEFAULT_QUEUE_CONFIG.runMissedSchedules,
  };
}

export function normalizeQueueConfig(input: Partial<QueueConfig>): QueueConfig {
  return readQueueConfig(input);
}

/** 应用设置了执行超时就优先用应用的，否则用系统值。 */
export function effectiveRunTimeoutMinutes(
  siteTimeoutMinutes: number | null | undefined,
  systemTimeoutMinutes: number,
): number {
  return siteTimeoutMinutes ?? systemTimeoutMinutes;
}
