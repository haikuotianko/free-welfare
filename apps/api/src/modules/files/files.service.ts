import { Injectable } from '@nestjs/common';
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve, sep } from 'node:path';
import { PrismaService } from '../../database/prisma.service';
import { AppError } from '../../common/app-error';
import { dataRoot } from '../../common/app-data';

const TEXT_EXTENSIONS =
  /\.(js|ts|mjs|cjs|jsx|tsx|vue|json|md|markdown|txt|yml|yaml|toml|ini|env|conf|config|log|html|css|xml|csv|sh|ps1|bat|cmd|sql|prisma|py|rb|go|java|kt|c|h|cpp|hpp|cs|php|rs|swift|lua|pl)$/i;
const TEXT_FILENAMES = new Set([
  'Dockerfile',
  'Containerfile',
  'Makefile',
  'Rakefile',
  'Gemfile',
  'Procfile',
  '.env',
  '.gitignore',
  '.npmrc',
  '.editorconfig',
  'README',
  'LICENSE',
  'CHANGELOG',
]);
const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif|svg|ico|bmp)$/i;
const IGNORED = new Set(['.git', 'node_modules', '.cache', '.DS_Store']);
const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

const MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  json: 'application/json',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  ts: 'text/typescript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  html: 'text/html; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
};

export interface FileSpace {
  id: string;
  name: string;
  kind: 'user' | 'source';
}

interface ResolvedSpace extends FileSpace {
  root: string;
}

function normalizePath(input: string): string {
  const value = String(input ?? '').replace(/\\/g, '/').trim();
  if (!value || value === '.') return '';
  if (value.startsWith('/') || value.includes('\0')) {
    throw new AppError('validation_failed', '文件路径不合法', 400);
  }
  const parts = value.split('/').filter(Boolean);
  if (parts.some((part) => part === '..' || part === '.')) {
    throw new AppError('validation_failed', '文件路径不合法', 400);
  }
  if (parts.some((part) => IGNORED.has(part))) {
    throw new AppError('forbidden_path', '该目录不可访问', 403);
  }
  return parts.join('/');
}

function joinPath(base: string, name: string): string {
  return base ? `${base}/${name}` : name;
}

function isTextFile(filePath: string): boolean {
  const name = basename(filePath);
  return TEXT_EXTENSIONS.test(name) || TEXT_FILENAMES.has(name);
}

function mimeFor(filePath: string): string {
  const ext = extname(filePath).replace(/^\./, '').toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

@Injectable()
export class FilesService {
  constructor(private readonly prisma: PrismaService) {}

  async listSpaces(): Promise<FileSpace[]> {
    const userRoot = resolve(dataRoot(), 'apps');
    await mkdir(userRoot, { recursive: true });
    const sources = await this.prisma.client.scriptSource.findMany({
      orderBy: { createdAt: 'asc' },
    });
    const spaces: FileSpace[] = [{ id: 'user', name: '用户空间', kind: 'user' }];
    for (const source of sources) {
      const root = resolve(dataRoot(), 'sources', source.id);
      await mkdir(root, { recursive: true });
      spaces.push({ id: `source:${source.id}`, name: source.name, kind: 'source' });
    }
    return spaces;
  }

  async list(spaceId: string, pathInput: string) {
    const space = await this.resolveSpace(spaceId);
    const relativePath = normalizePath(pathInput);
    const full = await this.resolveExisting(space, relativePath);
    const info = await lstat(full);
    if (!info.isDirectory()) throw new AppError('not_directory', '不是目录', 400);

    const entries = await readdir(full, { withFileTypes: true });
    const result: Array<{
      name: string;
      path: string;
      type: 'dir' | 'file';
      size: number;
      updatedAt: string;
      editable: boolean;
      previewable: boolean;
    }> = [];

    for (const entry of entries) {
      if (IGNORED.has(entry.name)) continue;
      const entryPath = joinPath(relativePath, entry.name);
      const entryFull = resolve(space.root, entryPath);
      let entryInfo;
      try {
        entryInfo = await lstat(entryFull);
      } catch {
        continue;
      }
      if (entryInfo.isSymbolicLink()) continue;
      result.push({
        name: entry.name,
        path: entryPath,
        type: entryInfo.isDirectory() ? 'dir' : 'file',
        size: entryInfo.size,
        updatedAt: entryInfo.mtime.toISOString(),
        editable: entryInfo.isFile() && isTextFile(entry.name),
        previewable: entryInfo.isFile() && IMAGE_EXTENSIONS.test(entry.name),
      });
    }

    result.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });

    return { space: space.id, path: relativePath, entries: result };
  }

  async readText(spaceId: string, pathInput: string) {
    const space = await this.resolveSpace(spaceId);
    const relativePath = normalizePath(pathInput);
    if (!relativePath || !isTextFile(relativePath)) {
      throw new AppError('not_text_file', '该文件不支持文本编辑', 400);
    }
    const full = await this.resolveExisting(space, relativePath);
    const info = await lstat(full);
    if (!info.isFile()) throw new AppError('not_file', '不是文件', 400);
    if (info.size > MAX_TEXT_BYTES) throw new AppError('file_too_large', '文件超过 1MB', 400);
    return { space: space.id, path: relativePath, content: await readFile(full, 'utf8') };
  }

  async writeText(spaceId: string, pathInput: string, content: string) {
    const space = await this.resolveSpace(spaceId);
    const relativePath = normalizePath(pathInput);
    if (!relativePath || !isTextFile(relativePath)) {
      throw new AppError('validation_failed', '文件名或类型不支持文本编辑', 400);
    }
    if (Buffer.byteLength(content, 'utf8') > MAX_TEXT_BYTES) {
      throw new AppError('file_too_large', '文件超过 1MB', 400);
    }
    const full = resolve(space.root, relativePath);
    await mkdir(dirname(full), { recursive: true });
    await this.ensureInsideRealRoot(space, dirname(full));
    await writeFile(full, content, 'utf8');
    return { space: space.id, path: relativePath, size: Buffer.byteLength(content, 'utf8') };
  }

  async createDirectory(spaceId: string, pathInput: string) {
    const space = await this.resolveSpace(spaceId);
    const relativePath = normalizePath(pathInput);
    if (!relativePath) throw new AppError('validation_failed', '目录名不能为空', 400);
    const full = resolve(space.root, relativePath);
    await this.ensureInsideRealRoot(space, dirname(full));
    try {
      await mkdir(full);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new AppError('already_exists', '目录已存在', 409);
      }
      throw error;
    }
    return { space: space.id, path: relativePath };
  }

  async renameEntry(spaceId: string, fromInput: string, toInput: string) {
    const space = await this.resolveSpace(spaceId);
    const fromPath = normalizePath(fromInput);
    const toPath = normalizePath(toInput);
    if (!fromPath || !toPath) throw new AppError('validation_failed', '路径不能为空', 400);
    const fromFull = await this.resolveExisting(space, fromPath);
    const toFull = resolve(space.root, toPath);
    try {
      await lstat(toFull);
      throw new AppError('already_exists', '目标已存在', 409);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await mkdir(dirname(toFull), { recursive: true });
    await this.ensureInsideRealRoot(space, dirname(toFull));
    await rename(fromFull, toFull);
    return { space: space.id, from: fromPath, to: toPath };
  }

  async deleteEntry(spaceId: string, pathInput: string) {
    const space = await this.resolveSpace(spaceId);
    const relativePath = normalizePath(pathInput);
    if (!relativePath) throw new AppError('validation_failed', '不能删除空间根目录', 400);
    const full = await this.resolveExisting(space, relativePath);
    const info = await lstat(full);
    if (info.isDirectory()) {
      await rm(full, { recursive: true, force: false });
    } else {
      await unlink(full);
    }
    return { ok: true, space: space.id, path: relativePath };
  }

  async readBinary(spaceId: string, pathInput: string) {
    const space = await this.resolveSpace(spaceId);
    const relativePath = normalizePath(pathInput);
    if (!relativePath) throw new AppError('validation_failed', '文件路径不能为空', 400);
    const full = await this.resolveExisting(space, relativePath);
    const info = await lstat(full);
    if (!info.isFile()) throw new AppError('not_file', '不是文件', 400);
    if (info.size > MAX_UPLOAD_BYTES) throw new AppError('file_too_large', '文件超过 2MB', 400);
    return {
      name: basename(relativePath),
      contentType: mimeFor(relativePath),
      data: await readFile(full),
    };
  }

  async upload(spaceId: string, pathInput: string, dataBase64: string) {
    const space = await this.resolveSpace(spaceId);
    const relativePath = normalizePath(pathInput);
    if (!relativePath) throw new AppError('validation_failed', '文件路径不能为空', 400);
    const buffer = Buffer.from(dataBase64, 'base64');
    if (buffer.length === 0 || buffer.length > MAX_UPLOAD_BYTES) {
      throw new AppError('file_too_large', '文件超过 2MB', 400);
    }
    const full = resolve(space.root, relativePath);
    await mkdir(dirname(full), { recursive: true });
    await this.ensureInsideRealRoot(space, dirname(full));
    await writeFile(full, buffer);
    return { space: space.id, path: relativePath, size: buffer.length };
  }

  private async resolveSpace(spaceId: string): Promise<ResolvedSpace> {
    if (spaceId === 'user') {
      const root = resolve(dataRoot(), 'apps');
      await mkdir(root, { recursive: true });
      return { id: 'user', name: '用户空间', kind: 'user', root };
    }
    if (spaceId.startsWith('source:')) {
      const id = spaceId.slice('source:'.length);
      const source = await this.prisma.client.scriptSource.findUnique({ where: { id } });
      if (!source) throw new AppError('not_found', '订阅源不存在', 404);
      const root = resolve(dataRoot(), 'sources', source.id);
      await mkdir(root, { recursive: true });
      return { id: spaceId, name: source.name, kind: 'source', root };
    }
    throw new AppError('not_found', '文件空间不存在', 404);
  }

  private async resolveExisting(space: ResolvedSpace, relativePath: string): Promise<string> {
    const full = resolve(space.root, relativePath);
    const realRoot = await realpath(space.root);
    let realFull: string;
    try {
      realFull = await realpath(full);
    } catch {
      throw new AppError('not_found', '文件或目录不存在', 404);
    }
    if (realFull !== realRoot && !realFull.startsWith(realRoot + sep)) {
      throw new AppError('forbidden_path', '路径越界', 403);
    }
    return full;
  }

  private async ensureInsideRealRoot(space: ResolvedSpace, parentDir: string) {
    const realRoot = await realpath(space.root);
    let realParent: string;
    try {
      realParent = await realpath(parentDir);
    } catch {
      throw new AppError('validation_failed', '父目录不存在', 400);
    }
    if (realParent !== realRoot && !realParent.startsWith(realRoot + sep)) {
      throw new AppError('forbidden_path', '路径越界', 403);
    }
  }
}
