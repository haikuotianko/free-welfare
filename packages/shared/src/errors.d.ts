export declare const ERROR_CODES: {
    readonly AUTH_REQUIRED: "auth_required";
    readonly AUTH_INVALID: "auth_invalid";
    readonly AUTH_SETUP_DONE: "auth_setup_done";
    readonly FORBIDDEN: "forbidden";
    readonly NOT_FOUND: "not_found";
    readonly VALIDATION_FAILED: "validation_failed";
    readonly CONFLICT: "conflict";
    readonly YYB_NOT_CONFIGURED: "yyb_not_configured";
    readonly YYB_UNAVAILABLE: "yyb_unavailable";
    readonly YYB_RESCAN: "yyb_rescan";
    readonly NETWORK_DENIED: "network_denied";
    readonly SCRIPT_ERROR: "script_error";
    readonly TASK_INVALID: "task_invalid";
    readonly RUN_NOT_FOUND: "run_not_found";
    readonly SYSTEM_ERROR: "system_error";
};
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
