export * from './types';
export * from './errors';
export * from './host';
export * from './context';
export * from './legacy';
export { createConfigApi, createEnvApi, retry, sleep } from './utils';

import type { Adapter } from './types';

export function defineAdapter<T extends Adapter>(adapter: T): T {
  return adapter;
}

export const defineScript = defineAdapter;
