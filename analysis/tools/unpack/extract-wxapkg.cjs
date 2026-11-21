#!/usr/bin/env node
'use strict';

/**
 * 极简 wxapkg 解包器（只负责拆文件，不格式化）。
 *
 * 用途：KillWxapkg 在遇到非标准 JSON（例如 .vscode/launch.json）时会中断，
 * 用这个脚本继续拆已经解密好的 wxapkg。
 *
 * 用法：
 *   node analysis/tools/unpack/extract-wxapkg.cjs <input.wxapkg> <output-dir>
 */

const fs = require('node:fs');
const path = require('node:path');

const input = process.argv[2];
const output = process.argv[3];

if (!input || !output) {
  console.error('用法: node extract-wxapkg.cjs <input.wxapkg> <output-dir>');
  process.exit(1);
}

const buffer = fs.readFileSync(input);
if (buffer[0] !== 0xbe) {
  throw new Error('不是已解密的 wxapkg（首字节应为 0xBE）');
}

const count = buffer.readUInt32BE(14);
let cursor = 18;
const entries = [];

for (let index = 0; index < count; index += 1) {
  if (cursor + 4 > buffer.length) throw new Error('文件表越界');
  const nameLength = buffer.readUInt32BE(cursor);
  cursor += 4;
  if (cursor + nameLength + 8 > buffer.length) throw new Error('文件名越界');
  const name = buffer.slice(cursor, cursor + nameLength).toString('utf8');
  cursor += nameLength;
  const offset = buffer.readUInt32BE(cursor);
  const size = buffer.readUInt32BE(cursor + 4);
  cursor += 8;
  entries.push({ name, offset, size });
}

fs.mkdirSync(output, { recursive: true });

let written = 0;
for (const entry of entries) {
  const relative = entry.name.replace(/^\/+/, '').replace(/\\/g, '/');
  const normalized = path.posix.normalize(relative);
  if (normalized.startsWith('..') || path.posix.isAbsolute(normalized)) {
    console.warn('跳过不安全路径:', entry.name);
    continue;
  }
  const destination = path.join(output, normalized);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, buffer.slice(entry.offset, entry.offset + entry.size));
  written += 1;
}

console.log(`完成：${written}/${entries.length} 个文件 -> ${output}`);
