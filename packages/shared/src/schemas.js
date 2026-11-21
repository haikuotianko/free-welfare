"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskCreateSchema = exports.siteUpdateSchema = exports.siteCreateSchema = exports.networkConfigSchema = exports.rootUrlSchema = exports.loginSchema = exports.setupSchema = exports.passwordSchema = exports.usernameSchema = void 0;
const zod_1 = require("zod");
const constants_1 = require("./constants");
exports.usernameSchema = zod_1.z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'username may contain letters, numbers, _ . -');
exports.passwordSchema = zod_1.z.string().min(8).max(128);
exports.setupSchema = zod_1.z.object({
    username: exports.usernameSchema,
    password: exports.passwordSchema,
});
exports.loginSchema = exports.setupSchema;
exports.rootUrlSchema = zod_1.z.object({
    id: zod_1.z.string().min(1).max(64),
    url: zod_1.z.string().url(),
    purpose: zod_1.z.string().max(200).default(''),
    pathPrefix: zod_1.z.string().max(200).default(''),
    usedBy: zod_1.z.array(zod_1.z.string()).default([]),
    required: zod_1.z.boolean().default(false),
});
exports.networkConfigSchema = zod_1.z.object({
    mode: zod_1.z.enum(constants_1.NETWORK_MODES).default('whitelist'),
    rootUrls: zod_1.z.array(exports.rootUrlSchema).default([]),
    allowedOrigins: zod_1.z.array(zod_1.z.string().url()).default([]),
    notes: zod_1.z.string().max(1000).default(''),
});
exports.siteCreateSchema = zod_1.z.object({
    key: zod_1.z
        .string()
        .trim()
        .min(2)
        .max(64)
        .regex(/^[a-z0-9][a-z0-9_-]*$/, 'key must be lowercase ascii'),
    name: zod_1.z.string().trim().min(1).max(100),
    platform: zod_1.z.string().trim().default('wechat_miniprogram'),
    appId: zod_1.z.string().trim().min(1).max(64),
    iconUrl: zod_1.z.string().url().optional().or(zod_1.z.literal('')),
    description: zod_1.z.string().max(1000).default(''),
    capabilities: zod_1.z.array(zod_1.z.enum(constants_1.CAPABILITIES)).default([]),
    network: exports.networkConfigSchema.optional(),
});
exports.siteUpdateSchema = exports.siteCreateSchema.partial();
exports.taskCreateSchema = zod_1.z.object({
    bindingId: zod_1.z.string().min(1),
    capability: zod_1.z.enum(constants_1.CAPABILITIES),
    cron: zod_1.z.string().min(1).max(100).optional(),
    timezone: zod_1.z.string().default('Asia/Shanghai'),
    timeoutSeconds: zod_1.z.number().int().min(10).max(3600).default(120),
    maxAttempts: zod_1.z.number().int().min(1).max(10).default(3),
    enabled: zod_1.z.boolean().default(true),
});
//# sourceMappingURL=schemas.js.map