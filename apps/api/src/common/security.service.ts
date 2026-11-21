import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { AppConfigService } from '../config/config.module';

@Injectable()
export class SecurityService {
  private readonly key: Buffer;

  constructor(private readonly config: AppConfigService) {
    const raw = config.get('APP_ENCRYPTION_KEY');
    this.key = raw
      ? Buffer.from(raw, 'base64')
      : createHash('sha256').update(config.get('AUTH_SESSION_SECRET')).digest();
    if (this.key.length !== 32) {
      throw new Error('APP_ENCRYPTION_KEY must be 32 bytes base64');
    }
  }

  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    return `scrypt$${salt}$${hash}`;
  }

  verifyPassword(password: string, stored: string): boolean {
    const [scheme, salt, hash] = stored.split('$');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const expected = Buffer.from(hash, 'hex');
    const actual = scryptSync(password, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  decrypt(value: string): string {
    const parts = value.split(':');
    if (parts.length !== 4 || parts[0] !== 'v1' || !parts[1] || !parts[2]) {
      throw new Error('invalid encrypted value');
    }
    const [, iv, tag, encrypted] = parts;
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
