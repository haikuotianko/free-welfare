import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function dataRoot(): string {
  if (process.env.DATA_DIR) return resolve(process.env.DATA_DIR);
  const candidates = [resolve(process.cwd(), 'data'), resolve(process.cwd(), '..', '..', 'data')];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

export function siteDir(siteKey: string): string {
  return resolve(dataRoot(), 'apps', siteKey);
}
