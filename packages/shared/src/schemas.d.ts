import { z } from 'zod';
export declare const usernameSchema: z.ZodString;
export declare const passwordSchema: z.ZodString;
export declare const setupSchema: z.ZodObject<{
    username: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    username: string;
    password: string;
}, {
    username: string;
    password: string;
}>;
export declare const loginSchema: z.ZodObject<{
    username: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    username: string;
    password: string;
}, {
    username: string;
    password: string;
}>;
export declare const rootUrlSchema: z.ZodObject<{
    id: z.ZodString;
    url: z.ZodString;
    purpose: z.ZodDefault<z.ZodString>;
    pathPrefix: z.ZodDefault<z.ZodString>;
    usedBy: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    required: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    id: string;
    url: string;
    purpose: string;
    pathPrefix: string;
    usedBy: string[];
    required: boolean;
}, {
    id: string;
    url: string;
    purpose?: string | undefined;
    pathPrefix?: string | undefined;
    usedBy?: string[] | undefined;
    required?: boolean | undefined;
}>;
export declare const networkConfigSchema: z.ZodObject<{
    mode: z.ZodDefault<z.ZodEnum<["whitelist", "unrestricted"]>>;
    rootUrls: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        url: z.ZodString;
        purpose: z.ZodDefault<z.ZodString>;
        pathPrefix: z.ZodDefault<z.ZodString>;
        usedBy: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        required: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        url: string;
        purpose: string;
        pathPrefix: string;
        usedBy: string[];
        required: boolean;
    }, {
        id: string;
        url: string;
        purpose?: string | undefined;
        pathPrefix?: string | undefined;
        usedBy?: string[] | undefined;
        required?: boolean | undefined;
    }>, "many">>;
    allowedOrigins: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    notes: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    mode: "whitelist" | "unrestricted";
    rootUrls: {
        id: string;
        url: string;
        purpose: string;
        pathPrefix: string;
        usedBy: string[];
        required: boolean;
    }[];
    allowedOrigins: string[];
    notes: string;
}, {
    mode?: "whitelist" | "unrestricted" | undefined;
    rootUrls?: {
        id: string;
        url: string;
        purpose?: string | undefined;
        pathPrefix?: string | undefined;
        usedBy?: string[] | undefined;
        required?: boolean | undefined;
    }[] | undefined;
    allowedOrigins?: string[] | undefined;
    notes?: string | undefined;
}>;
export declare const siteCreateSchema: z.ZodObject<{
    key: z.ZodString;
    name: z.ZodString;
    platform: z.ZodDefault<z.ZodString>;
    appId: z.ZodString;
    iconUrl: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    description: z.ZodDefault<z.ZodString>;
    capabilities: z.ZodDefault<z.ZodArray<z.ZodEnum<["login", "register", "sign_in", "points", "products", "activities", "redeem", "grab"]>, "many">>;
    network: z.ZodOptional<z.ZodObject<{
        mode: z.ZodDefault<z.ZodEnum<["whitelist", "unrestricted"]>>;
        rootUrls: z.ZodDefault<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            url: z.ZodString;
            purpose: z.ZodDefault<z.ZodString>;
            pathPrefix: z.ZodDefault<z.ZodString>;
            usedBy: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            required: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            url: string;
            purpose: string;
            pathPrefix: string;
            usedBy: string[];
            required: boolean;
        }, {
            id: string;
            url: string;
            purpose?: string | undefined;
            pathPrefix?: string | undefined;
            usedBy?: string[] | undefined;
            required?: boolean | undefined;
        }>, "many">>;
        allowedOrigins: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        notes: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        mode: "whitelist" | "unrestricted";
        rootUrls: {
            id: string;
            url: string;
            purpose: string;
            pathPrefix: string;
            usedBy: string[];
            required: boolean;
        }[];
        allowedOrigins: string[];
        notes: string;
    }, {
        mode?: "whitelist" | "unrestricted" | undefined;
        rootUrls?: {
            id: string;
            url: string;
            purpose?: string | undefined;
            pathPrefix?: string | undefined;
            usedBy?: string[] | undefined;
            required?: boolean | undefined;
        }[] | undefined;
        allowedOrigins?: string[] | undefined;
        notes?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    key: string;
    name: string;
    platform: string;
    appId: string;
    description: string;
    capabilities: ("login" | "register" | "sign_in" | "points" | "products" | "activities" | "redeem" | "grab")[];
    iconUrl?: string | undefined;
    network?: {
        mode: "whitelist" | "unrestricted";
        rootUrls: {
            id: string;
            url: string;
            purpose: string;
            pathPrefix: string;
            usedBy: string[];
            required: boolean;
        }[];
        allowedOrigins: string[];
        notes: string;
    } | undefined;
}, {
    key: string;
    name: string;
    appId: string;
    platform?: string | undefined;
    iconUrl?: string | undefined;
    description?: string | undefined;
    capabilities?: ("login" | "register" | "sign_in" | "points" | "products" | "activities" | "redeem" | "grab")[] | undefined;
    network?: {
        mode?: "whitelist" | "unrestricted" | undefined;
        rootUrls?: {
            id: string;
            url: string;
            purpose?: string | undefined;
            pathPrefix?: string | undefined;
            usedBy?: string[] | undefined;
            required?: boolean | undefined;
        }[] | undefined;
        allowedOrigins?: string[] | undefined;
        notes?: string | undefined;
    } | undefined;
}>;
export declare const siteUpdateSchema: z.ZodObject<{
    key: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    platform: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    appId: z.ZodOptional<z.ZodString>;
    iconUrl: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>>;
    description: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    capabilities: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodEnum<["login", "register", "sign_in", "points", "products", "activities", "redeem", "grab"]>, "many">>>;
    network: z.ZodOptional<z.ZodOptional<z.ZodObject<{
        mode: z.ZodDefault<z.ZodEnum<["whitelist", "unrestricted"]>>;
        rootUrls: z.ZodDefault<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            url: z.ZodString;
            purpose: z.ZodDefault<z.ZodString>;
            pathPrefix: z.ZodDefault<z.ZodString>;
            usedBy: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            required: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            url: string;
            purpose: string;
            pathPrefix: string;
            usedBy: string[];
            required: boolean;
        }, {
            id: string;
            url: string;
            purpose?: string | undefined;
            pathPrefix?: string | undefined;
            usedBy?: string[] | undefined;
            required?: boolean | undefined;
        }>, "many">>;
        allowedOrigins: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        notes: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        mode: "whitelist" | "unrestricted";
        rootUrls: {
            id: string;
            url: string;
            purpose: string;
            pathPrefix: string;
            usedBy: string[];
            required: boolean;
        }[];
        allowedOrigins: string[];
        notes: string;
    }, {
        mode?: "whitelist" | "unrestricted" | undefined;
        rootUrls?: {
            id: string;
            url: string;
            purpose?: string | undefined;
            pathPrefix?: string | undefined;
            usedBy?: string[] | undefined;
            required?: boolean | undefined;
        }[] | undefined;
        allowedOrigins?: string[] | undefined;
        notes?: string | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    key?: string | undefined;
    name?: string | undefined;
    platform?: string | undefined;
    appId?: string | undefined;
    iconUrl?: string | undefined;
    description?: string | undefined;
    capabilities?: ("login" | "register" | "sign_in" | "points" | "products" | "activities" | "redeem" | "grab")[] | undefined;
    network?: {
        mode: "whitelist" | "unrestricted";
        rootUrls: {
            id: string;
            url: string;
            purpose: string;
            pathPrefix: string;
            usedBy: string[];
            required: boolean;
        }[];
        allowedOrigins: string[];
        notes: string;
    } | undefined;
}, {
    key?: string | undefined;
    name?: string | undefined;
    platform?: string | undefined;
    appId?: string | undefined;
    iconUrl?: string | undefined;
    description?: string | undefined;
    capabilities?: ("login" | "register" | "sign_in" | "points" | "products" | "activities" | "redeem" | "grab")[] | undefined;
    network?: {
        mode?: "whitelist" | "unrestricted" | undefined;
        rootUrls?: {
            id: string;
            url: string;
            purpose?: string | undefined;
            pathPrefix?: string | undefined;
            usedBy?: string[] | undefined;
            required?: boolean | undefined;
        }[] | undefined;
        allowedOrigins?: string[] | undefined;
        notes?: string | undefined;
    } | undefined;
}>;
export declare const taskCreateSchema: z.ZodObject<{
    bindingId: z.ZodString;
    capability: z.ZodEnum<["login", "register", "sign_in", "points", "products", "activities", "redeem", "grab"]>;
    cron: z.ZodOptional<z.ZodString>;
    timezone: z.ZodDefault<z.ZodString>;
    timeoutSeconds: z.ZodDefault<z.ZodNumber>;
    maxAttempts: z.ZodDefault<z.ZodNumber>;
    enabled: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    bindingId: string;
    capability: "login" | "register" | "sign_in" | "points" | "products" | "activities" | "redeem" | "grab";
    timezone: string;
    timeoutSeconds: number;
    maxAttempts: number;
    enabled: boolean;
    cron?: string | undefined;
}, {
    bindingId: string;
    capability: "login" | "register" | "sign_in" | "points" | "products" | "activities" | "redeem" | "grab";
    cron?: string | undefined;
    timezone?: string | undefined;
    timeoutSeconds?: number | undefined;
    maxAttempts?: number | undefined;
    enabled?: boolean | undefined;
}>;
export type SetupInput = z.infer<typeof setupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type NetworkConfigInput = z.infer<typeof networkConfigSchema>;
export type SiteCreateInput = z.infer<typeof siteCreateSchema>;
export type SiteUpdateInput = z.infer<typeof siteUpdateSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
