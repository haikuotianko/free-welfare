import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const dataDir = process.env.DATA_DIR || resolve(process.cwd(), 'data');
const secretsFile = join(dataDir, 'secrets.env');

function parse(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

function readSecretFile() {
  try {
    return existsSync(secretsFile) ? parse(readFileSync(secretsFile, 'utf8')) : {};
  } catch {
    return {};
  }
}

function generate() {
  return randomBytes(32).toString('base64');
}

const envKey = (process.env.APP_ENCRYPTION_KEY || '').trim();
const envSecret = (process.env.AUTH_SESSION_SECRET || '').trim();
let values = readSecretFile();

if (envKey && envSecret) {
  process.env.APP_ENCRYPTION_KEY = envKey;
  process.env.AUTH_SESSION_SECRET = envSecret;
} else {
  const appKey = envKey || values.APP_ENCRYPTION_KEY || '';
  const authSecret = envSecret || values.AUTH_SESSION_SECRET || '';

  if (appKey && authSecret) {
    process.env.APP_ENCRYPTION_KEY = appKey;
    process.env.AUTH_SESSION_SECRET = authSecret;
  } else {
    const next = {
      APP_ENCRYPTION_KEY: appKey || generate(),
      AUTH_SESSION_SECRET: authSecret || generate(),
    };
    const content = `APP_ENCRYPTION_KEY=${next.APP_ENCRYPTION_KEY}\nAUTH_SESSION_SECRET=${next.AUTH_SESSION_SECRET}\n`;

    mkdirSync(dataDir, { recursive: true });
    try {
      writeFileSync(secretsFile, content, { mode: 0o600, flag: 'wx' });
      console.log(`[secrets] generated ${secretsFile}`);
      process.env.APP_ENCRYPTION_KEY = next.APP_ENCRYPTION_KEY;
      process.env.AUTH_SESSION_SECRET = next.AUTH_SESSION_SECRET;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      values = readSecretFile();
      process.env.APP_ENCRYPTION_KEY = values.APP_ENCRYPTION_KEY || next.APP_ENCRYPTION_KEY;
      process.env.AUTH_SESSION_SECRET = values.AUTH_SESSION_SECRET || next.AUTH_SESSION_SECRET;
    }
  }
}
