export const CAPABILITIES = [
  'login',
  'register',
  'sign_in',
  'points',
  'products',
  'activities',
  'redeem',
  'grab',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const NETWORK_MODES = ['whitelist', 'unrestricted'] as const;
export type NetworkMode = (typeof NETWORK_MODES)[number];

export const SCRIPT_KINDS = ['action', 'common'] as const;
export type ScriptKind = (typeof SCRIPT_KINDS)[number];

export const SCRIPT_MODES = ['platform', 'qinglong'] as const;
export type ScriptMode = (typeof SCRIPT_MODES)[number];

export const REGISTRATION_MODES = [
  'unknown',
  'none',
  'auto',
  'one_click',
  'manual',
] as const;
export type RegistrationMode = (typeof REGISTRATION_MODES)[number];

export const PRODUCT_KINDS = ['product', 'grab'] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

export const REVIEW_STATUSES = ['reviewed', 'community', 'custom'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const RUN_STATUSES = [
  'starting',
  'queued',
  'running',
  'succeeded',
  'failed',
  'canceled',
  'timeout',
  'skipped',
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const ACCOUNT_STATUSES = [
  'alive',
  'session_only',
  'unknown',
  'expired',
  'disabled',
] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const DEFAULT_TIMEZONE =
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
