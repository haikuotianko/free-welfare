"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TIMEZONE = exports.ACCOUNT_STATUSES = exports.RUN_STATUSES = exports.REVIEW_STATUSES = exports.SCRIPT_KINDS = exports.NETWORK_MODES = exports.CAPABILITIES = void 0;
exports.CAPABILITIES = [
    'login',
    'register',
    'sign_in',
    'points',
    'products',
    'activities',
    'redeem',
    'grab',
];
exports.NETWORK_MODES = ['whitelist', 'unrestricted'];
exports.SCRIPT_KINDS = ['action', 'common'];
exports.REVIEW_STATUSES = ['reviewed', 'community', 'custom'];
exports.RUN_STATUSES = [
    'queued',
    'running',
    'succeeded',
    'failed',
    'canceled',
    'timeout',
];
exports.ACCOUNT_STATUSES = [
    'alive',
    'session_only',
    'unknown',
    'expired',
    'disabled',
];
exports.DEFAULT_TIMEZONE = 'Asia/Shanghai';
//# sourceMappingURL=constants.js.map