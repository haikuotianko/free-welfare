export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body !== undefined && init.body !== null && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new ApiError(
      body?.error?.message ?? `请求失败（${response.status}）`,
      body?.error?.code ?? 'http_error',
      response.status,
    );
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export interface Admin {
  id: string;
  username: string;
}

export interface AuthStatus {
  initialized: boolean;
  authenticated: boolean;
  onboardingCompleted: boolean;
  admin?: Admin;
}

export interface Account {
  id: string;
  yybRef: string;
  displayName: string;
  remark?: string | null;
  status: string;
  disabled?: boolean;
  scanProduct?: string | null;
  openidMasked?: string | null;
  timeOffsetMinutes: number;
  lastSyncedAt?: string | null;
}

export interface AccountSignIn {
  runId?: string | null;
  status: string;
  at?: string | null;
  message?: string | null;
  errorCode?: string | null;
  action?: string | null;
  schedule?: {
    scriptId: string;
    name: string;
    cron: string;
    enabled: boolean;
    nextRunAt?: string | null;
    lastRunAt?: string | null;
  } | null;
}

export interface YybRequestLog {
  id: string;
  type: string;
  source: string;
  method: string;
  path: string;
  status: string;
  httpStatus?: number | null;
  durationMs?: number | null;
  errorMessage?: string | null;
  wechatAccountId?: string | null;
  wechatAccountName?: string | null;
  siteId?: string | null;
  siteName?: string | null;
  siteAccountId?: string | null;
  createdAt: string;
}

export interface YybRequestPage {
  items: YybRequestLog[];
  total: number;
  success: number;
  failed: number;
  page: number;
  pageSize: number;
}

export interface YybQrSession {
  sessionId: string;
  status: string;
  image?: string | null;
  product?: string | null;
}

export interface YybQrPoll {
  status: string;
  message?: string;
  account?: unknown;
  accounts?: unknown[];
}

export interface FormField {
  key: string;
  label: string;
  type: 'text' | 'tel' | 'number' | 'date' | 'textarea' | 'select' | 'address' | string;
  defaultValue: string;
  note: string;
  required: boolean;
  options: string[];
}

export interface FormTemplate {
  id: string;
  name: string;
  description: string;
  fields: FormField[];
  createdAt: string;
  updatedAt: string;
  _count?: { accountForms: number };
}

export interface AccountForm {
  id: string;
  templateId: string;
  values: Record<string, string>;
  updatedAt: string;
  template: FormTemplate;
}

export interface ActivityFormField {
  key: string;
  label: string;
  type?: 'text' | 'tel' | 'number' | 'date' | 'textarea' | 'select' | 'address' | string;
  defaultValue?: string;
  note?: string;
  required?: boolean;
  options?: string[];
}

export interface ActivityFormSchema {
  title?: string;
  description?: string;
  submitText?: string;
  fields: ActivityFormField[];
}

export interface Activity {
  id: string;
  externalId: string;
  name: string;
  type: string;
  points?: number | null;
  status: string;
  progressCurrent?: number | null;
  progressTarget?: number | null;
  startAt?: string | null;
  endAt?: string | null;
  action: string;
  formSchema?: ActivityFormSchema | null;
  scriptId?: string | null;
  lastSyncedAt: string;
  script?: { id: string; name: string } | null;
  site?: {
    id: string;
    name: string;
    key: string;
    appId?: string;
    iconUrl?: string | null;
    pointsName: string;
    metadata?: Record<string, unknown> | null;
    config?: Record<string, unknown> | null;
  };
}

export interface RunStats {
  total: number;
  succeeded: number;
  failed: number;
  running: number;
  other: number;
}

export interface AccountOverview extends Account {
  accountForms: AccountForm[];
  runStats: RunStats;
  siteAccounts: Array<{
    id: string;
    siteId: string;
    businessUserId?: string | null;
    nickname?: string | null;
    status: string;
    disabled: boolean;
    envVars?: Record<string, string> | null;
    lastLoginAt?: string | null;
    site: { id: string; key: string; name: string; appId: string; iconUrl?: string | null; pointsName: string };
    runStats: RunStats;
    pointAccount?: {
      balance: number;
      currency: string;
      expiringAmount: number;
      nextExpiryAt?: string | null;
      estimated: boolean;
      lastSyncedAt?: string | null;
    } | null;
    signIn: AccountSignIn;
  }>;
}

export interface Site {
  id: string;
  key: string;
  name: string;
  appId: string;
  iconUrl?: string | null;
  description: string;
  pointsName: string;
  capabilities: string[];
  scriptMode: string;
  registrationMode: string;
  registrationNote: string;
  runTimeoutMinutes?: number | null;
  config: Record<string, unknown>;
  networkMode: string;
  rootUrls: RootUrl[];
  allowedOrigins: string[];
  networkNotes: string;
  status: string;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
  sourceId?: string | null;
  sourceAppKey?: string | null;
  source?: { id: string; name: string; trustLevel?: string; indexUrl?: string } | null;
  scripts?: Array<{ capabilities: string[] }>;
  _count?: { siteAccounts: number; bindings: number };
}

export interface SiteEnvVar {
  id: string;
  key: string;
  value: string;
  secret: boolean;
  description: string;
  enabled: boolean;
  updatedAt?: string;
}

export interface SiteScript {
  id: string;
  siteId: string;
  name: string;
  description: string;
  filePath: string;
  args: string;
  cron: string;
  timezone: string;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  capabilities: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AppScriptRow extends SiteScript {
  site: {
    id: string;
    key: string;
    name: string;
    iconUrl?: string | null;
    pointsName: string;
  };
}

export interface SiteScriptFile {
  path: string;
  size: number;
  updatedAt: string;
}

export interface RootUrl {
  id: string;
  url: string;
  purpose: string;
  pathPrefix: string;
  usedBy: string[];
  required: boolean;
}

export interface SiteAccountSummary {
  id: string;
  status: string;
  disabled: boolean;
  nickname?: string | null;
  businessUserId?: string | null;
  lastLoginAt?: string | null;
  wechatAccount: { id: string; displayName: string; status: string; disabled?: boolean };
  pointAccount?: { balance: number; currency: string; expiringAmount: number; nextExpiryAt?: string | null } | null;
}

export interface SiteBindingSummary {
  id: string;
  enabled: boolean;
  script: { id: string; name: string; capability?: string | null; kind: string; status: string };
  siteAccount: { id: string; wechatAccount: { displayName: string } };
}

export interface SiteDetail extends Site {
  siteAccounts: SiteAccountSummary[];
  bindings: SiteBindingSummary[];
  scripts: SiteScript[];
}

export interface QueueTicket {
  position: number;
  ahead: number;
  running: number;
  starting: number;
  queued: number;
  concurrency: number;
  perAccountConcurrency: number;
  perSiteConcurrency: number;
  willStartImmediately: boolean;
  startsAt: string | null;
}

export interface QueueConfig {
  concurrency: number;
  perAccountConcurrency: number;
  perSiteConcurrency: number;
  runTimeoutMinutes: number;
  maxQueueSize: number;
  runMissedSchedules: boolean;
}

export interface QueueStatus {
  config: QueueConfig;
  active: { running: number; starting: number; queued: number };
  queue: Array<{
    id: string;
    createdAt: string;
    notBefore?: string | null;
    siteName: string;
    scriptName: string;
    accountName: string;
  }>;
}

export interface ActionFormField {
  key: string;
  label: string;
  type?: 'text' | 'tel' | 'number' | 'textarea' | 'select' | 'checkbox' | string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  note?: string;
  options?: string[];
}

export interface RunActionDetails {
  action?: string;
  step?: string;
  formSchema?: ActionFormField[];
  [key: string]: unknown;
}

export interface Run {
  id: string;
  status: string;
  notBefore?: string | null;
  queue?: QueueTicket;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
  input?: Record<string, unknown> | null;
  summary?: unknown;
  task?: {
    capability: string;
    binding?: {
      site?: { id: string; key?: string; name: string; appId?: string };
      siteAccount?: {
        id: string;
        nickname?: string | null;
        wechatAccount?: { id: string; displayName: string };
      };
      script?: { name: string };
    };
  };
  siteScript?: { id: string; name: string; filePath: string; args: string } | null;
  site?: { id: string; key: string; name: string; appId?: string } | null;
  siteAccount?: {
    id: string;
    nickname?: string | null;
    businessUserId?: string | null;
    wechatAccount?: { id: string; displayName: string };
  } | null;
  logs?: Array<{ id: string; ts: string; level: string; message: string; data?: unknown }>;
}

export interface RunLogEntry {
  id: string;
  ts: string;
  level: string;
  message: string;
  data?: unknown;
  runId: string;
  runStatus: string;
  runCreatedAt: string;
  runStartedAt?: string | null;
  runFinishedAt?: string | null;
  durationMs?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  siteId?: string | null;
  siteName: string;
  siteKey: string;
  siteAccountId?: string | null;
  accountId?: string | null;
  accountName: string;
  scriptName: string;
}

export interface RunLogPage {
  items: RunLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Script {
  id: string;
  key: string;
  name: string;
  description?: string;
  kind: string;
  capability?: string | null;
  status: string;
  currentVersionId?: string | null;
  versions?: Array<{
    id: string;
    version: string;
    reviewStatus: string;
    bundlePath?: string | null;
    createdAt: string;
  }>;
}

export interface ScriptSource {
  id: string;
  name: string;
  repoUrl: string;
  branch: string;
  indexUrl: string;
  trustLevel: string;
  enabled: boolean;
  lastSyncedAt?: string | null;
  lastError?: string | null;
}

export interface AvailableScriptVersion {
  id: string;
  scriptId: string;
  scriptKey: string;
  scriptName: string;
  version: string;
  reviewStatus: string;
  kind: string;
  capability?: string | null;
  installed: boolean;
  current: boolean;
  bundlePath?: string | null;
  createdAt: string;
}

export interface AppSource extends ScriptSource {
  createdAt?: string;
  _count?: { apps: number; versions: number };
}

export interface StoreApp {
  id: string;
  key: string;
  name: string;
  appId: string;
  platform: string;
  description: string;
  iconUrl?: string | null;
  pointsName: string;
  category: string;
  version: string;
  scriptCount: number;
  updatedAt: string;
  source: {
    id: string;
    name: string;
    trustLevel: string;
    indexUrl: string;
    lastSyncedAt?: string | null;
  };
  installed: boolean;
  site: {
    id: string;
    name: string;
    iconUrl?: string | null;
    sourceId?: string | null;
    sourceAppKey?: string | null;
  } | null;
  updateAvailable: boolean;
}

export interface StoreInstallResult {
  ok: boolean;
  appId: string;
  site: {
    id: string;
    key: string;
    name: string;
    scripts: SiteScript[];
    envVars: Array<{ id: string; key: string; description: string; secret: boolean; enabled: boolean }>;
  };
  created: boolean;
  files: string[];
  scripts: number;
  envCount: number;
  bound: number;
}

export type ConfigSource = 'database' | 'env' | 'default' | 'none';

export interface Settings {
  yybBaseUrl: string;
  yybConfigured: boolean;
  scriptSourceUrl: string;
  serverchanConfigured: boolean;
  onboardingCompleted: boolean;
  sources: {
    yybBaseUrl: ConfigSource;
    yybIntegrationToken: ConfigSource;
    yybProtocolToken: ConfigSource;
    scriptSourceUrl: ConfigSource;
    serverchanToken: ConfigSource;
  };
}

export interface YybTestCheck {
  key: string;
  label: string;
  ok: boolean;
  skipped?: boolean;
  accountCount?: number;
  httpStatus?: number | null;
  message: string;
}

export interface YybTestResult {
  ok: boolean;
  baseUrl: string;
  checks: YybTestCheck[];
  message: string;
}

export interface SourceTestResult {
  ok: boolean;
  indexUrl: string;
  apps: number;
  scripts: number;
  topLevelScripts: number;
  appScripts: number;
  generatedAt?: string | null;
  bytes: number;
}

export interface SourceSyncResult {
  sourceId: string;
  synced: number;
  topLevelScripts?: number;
  appScripts?: number;
  scripts?: number;
  apps: number;
  generatedAt?: string | null;
}

export interface ClockUpcomingItem {
  siteId: string;
  siteKey: string;
  siteName: string;
  siteIconUrl?: string | null;
  pointsName: string;
  scriptId: string;
  scriptName: string;
  nextRunAt: string;
  secondsLeft: number;
}

export interface ClockData {
  mode: 'auto' | 'manual';
  offsetMs: number;
  sourceUrl: string;
  syncIntervalSeconds: number;
  lastSyncedAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  lastRemoteTime: string | null;
  manualTime: string | null;
  serverNow: string;
  now: string;
  timezone: string;
  upcoming: ClockUpcomingItem[];
  active: { running: number; starting?: number; queued: number };
}
