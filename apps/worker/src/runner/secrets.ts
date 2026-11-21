import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function key(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (raw) {
    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length === 32) return decoded;
  }
  return createHash('sha256').update(process.env.AUTH_SESSION_SECRET ?? '').digest();
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(value: string): string {
  const [version, iv, tag, encrypted] = value.split(':');
  if (version !== 'v1' || !iv || !tag || !encrypted) {
    throw new Error('invalid encrypted value');
  }
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
