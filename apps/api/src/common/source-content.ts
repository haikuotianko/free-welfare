import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { dataRoot } from './app-data';
import { AppError } from './app-error';

const LOCAL_PREFIX = 'local://';

export function isLocalSourceUrl(url: string): boolean {
  return String(url || '').startsWith(LOCAL_PREFIX);
}

function localPath(url: string): string {
  const relativePath = String(url).slice(LOCAL_PREFIX.length).replace(/^\/+/, '');
  const root = resolve(dataRoot());
  const full = resolve(root, relativePath);
  if (full !== root && !full.startsWith(root + sep)) {
    throw new AppError('validation_failed', '本地源路径不合法', 400);
  }
  return full;
}

/**
 * 读取源文件：支持 http(s) 和 local://（相对于 data 目录）。
 * 远程相对地址按 baseUrl 解析。
 */
export async function readSourceBuffer(url: string, baseUrl?: string): Promise<Buffer> {
  const value = String(url || '').trim();
  if (!value) throw new AppError('validation_failed', '源文件地址为空', 400);

  if (isLocalSourceUrl(value)) {
    return readFile(localPath(value));
  }

  const absolute = baseUrl ? new URL(value, baseUrl) : new URL(value);
  if (absolute.protocol !== 'http:' && absolute.protocol !== 'https:') {
    throw new AppError('validation_failed', '源文件只支持 http(s) 或 local://', 400);
  }

  const response = await fetch(absolute, {
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new AppError('source_fetch_failed', `读取源文件失败：HTTP ${response.status}`, 502);
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function readSourceText(url: string, baseUrl?: string): Promise<string> {
  const text = (await readSourceBuffer(url, baseUrl)).toString('utf8');
  return text.replace(/^\uFEFF/, '');
}
