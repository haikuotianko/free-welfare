import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { z } from 'zod';

for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  if (existsSync(candidate)) {
    config({ path: candidate });
    break;
  }
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    APP_PORT: z.coerce.number().default(3000),
    APP_URL: z.string().default('http://localhost:3000'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    APP_ENCRYPTION_KEY: z.string().optional(),
    AUTH_SESSION_SECRET: z.string().default('dev-session-secret-change-me'),
    YYB_BASE_URL: z.string().optional(),
    YYB_INTEGRATION_TOKEN: z.string().optional(),
    YYB_PROTOCOL_TOKEN: z.string().optional(),
    SCRIPT_SOURCE_URL: z.string().optional(),
    SERVERCHAN_TOKEN: z.string().optional(),
    LOG_LEVEL: z.string().default('info'),
    TZ: z.string().default(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (!env.APP_ENCRYPTION_KEY) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['APP_ENCRYPTION_KEY'], message: 'production requires APP_ENCRYPTION_KEY' });
    }
    if (!env.AUTH_SESSION_SECRET || env.AUTH_SESSION_SECRET === 'dev-session-secret-change-me') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['AUTH_SESSION_SECRET'], message: 'production requires a strong AUTH_SESSION_SECRET' });
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration');
  }
  cached = parsed.data;
  return cached;
}
