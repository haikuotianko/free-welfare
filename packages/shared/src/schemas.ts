import { z } from 'zod';
import { CAPABILITIES, DEFAULT_TIMEZONE, NETWORK_MODES, REGISTRATION_MODES, SCRIPT_MODES } from './constants';

export const usernameSchema = z
  .string()
  .trim()
  .min(3, '用户名至少 3 个字符')
  .max(64, '用户名最多 64 个字符')
  .regex(/^[a-zA-Z0-9_.-]+$/, '用户名只能包含字母、数字、下划线、点和短横线');

export const passwordSchema = z
  .string()
  .min(6, '密码至少 6 位')
  .max(128, '密码最多 128 位');

export const setupSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export const loginSchema = setupSchema;

export const httpUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), 'only http/https URLs are supported');

export const iconUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((value) => {
    if (!value) return true;
    if (/^https?:\/\//i.test(value)) {
      return httpUrlSchema.safeParse(value).success;
    }
    if (value.startsWith('/') || value.includes('\\') || value.includes('..')) return false;
    return /\.(png|jpe?g|webp|gif|svg|ico)$/i.test(value);
  }, 'icon must be an http(s) URL or an image path inside the app directory');

export const rootUrlSchema = z.object({
  id: z.string().min(1).max(64),
  url: httpUrlSchema,
  purpose: z.string().max(200).default(''),
  pathPrefix: z.string().max(200).default(''),
  usedBy: z.array(z.string()).default([]),
  required: z.boolean().default(false),
});

export const networkConfigSchema = z.object({
  mode: z.enum(NETWORK_MODES).default('whitelist'),
  rootUrls: z.array(rootUrlSchema).default([]),
  allowedOrigins: z.array(httpUrlSchema).default([]),
  notes: z.string().max(1000).default(''),
});

export const siteCreateSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9_-]*$/, 'key must be lowercase ascii'),
  name: z.string().trim().min(1).max(100),
  platform: z.string().trim().default('wechat_miniprogram'),
  appId: z.string().trim().min(1).max(64),
  iconUrl: iconUrlSchema.optional(),
  description: z.string().max(1000).default(''),
  pointsName: z.string().trim().min(1).max(20).default('积分'),
  scriptMode: z.enum(SCRIPT_MODES).default('platform'),
  runTimeoutMinutes: z.number().int().min(1).max(1440).nullable().optional(),
  registrationMode: z.enum(REGISTRATION_MODES).default('unknown'),
  registrationNote: z.string().max(300).default(''),
  config: z.record(z.unknown()).default({}),
  capabilities: z.array(z.enum(CAPABILITIES)).default([]),
  network: networkConfigSchema.optional(),
});

export const siteUpdateSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9_-]*$/, 'key must be lowercase ascii')
    .optional(),
  name: z.string().trim().min(1).max(100).optional(),
  platform: z.string().trim().optional(),
  appId: z.string().trim().min(1).max(64).optional(),
  iconUrl: iconUrlSchema.optional(),
  description: z.string().max(1000).optional(),
  pointsName: z.string().trim().min(1).max(20).optional(),
  scriptMode: z.enum(SCRIPT_MODES).optional(),
  runTimeoutMinutes: z.number().int().min(1).max(1440).nullable().optional(),
  registrationMode: z.enum(REGISTRATION_MODES).optional(),
  registrationNote: z.string().max(300).optional(),
  config: z.record(z.unknown()).optional(),
  capabilities: z.array(z.enum(CAPABILITIES)).optional(),
  network: networkConfigSchema.optional(),
});

export const siteEnvVarSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'env key must match [A-Za-z_][A-Za-z0-9_]*'),
  value: z.string().max(20_000).default(''),
  secret: z.boolean().default(false),
  description: z.string().max(500).default(''),
  enabled: z.boolean().default(true),
});

export const siteEnvUpdateSchema = z.object({
  vars: z.array(siteEnvVarSchema).max(200),
});

export type SiteEnvVarInput = z.infer<typeof siteEnvVarSchema>;

export const taskCreateSchema = z.object({
  bindingId: z.string().min(1),
  capability: z.enum(CAPABILITIES),
  cron: z.string().min(1).max(100).optional(),
  timezone: z.string().default(DEFAULT_TIMEZONE),
  timeoutSeconds: z.number().int().min(10).max(3600).default(120),
  maxAttempts: z.number().int().min(1).max(10).default(3),
  enabled: z.boolean().default(true),
});

export type SetupInput = z.infer<typeof setupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type NetworkConfigInput = z.infer<typeof networkConfigSchema>;
export type SiteCreateInput = z.infer<typeof siteCreateSchema>;
export type SiteUpdateInput = z.infer<typeof siteUpdateSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
