import type { Capability, ProductKind, ScriptMode } from '@free-welfare/shared';
import type { ScriptError } from './errors';

export type { ProductKind, ScriptMode } from '@free-welfare/shared';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
export type HttpResponseType = 'json' | 'text' | 'base64';
export type CacheScope = 'run' | 'account' | 'app';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type TriggerType = 'manual' | 'schedule' | 'retry' | 'api';

export type BytesLike = string | Uint8Array;

export interface RunInfo {
  id: string;
  taskId: string;
  capability: Capability | string;
  attempt: number;
  trigger: TriggerType;
  dryRun: boolean;
  startedAt: string;
  timeoutMs: number;
  mode: ScriptMode;
  script: {
    id: string;
    key: string;
    name: string;
    version: string;
    filePath?: string;
    args?: string;
  };
  input?: Record<string, unknown>;
}

export interface AppInfo {
  id: string;
  key: string;
  name: string;
  appId: string;
  platform: string;
  description: string;
  iconUrl?: string | null;
  status: string;
  mode: ScriptMode;
  metadata: Record<string, unknown>;
  config: ConfigApi;
  env: EnvApi;
}

export interface AccountInfo {
  id: string;
  wechatAccountId: string;
  displayName: string;
  yybRef: string;
  status: string;
  businessUserId?: string | null;
  nickname?: string | null;
  openidMasked?: string | null;
  avatarUrl?: string | null;
  lastLoginAt?: string | null;
}

export interface UserInfo {
  accountId: string;
  displayName: string;
  nickname?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  openidMasked?: string | null;
  businessUserId?: string | null;
  memberLevel?: string | null;
  points?: number | null;
  raw?: unknown;
}

export interface ConfigApi {
  get<T = unknown>(key: string, fallback?: T): T | undefined;
  require<T = unknown>(key: string): T;
  has(key: string): boolean;
  all(): Record<string, unknown>;
  getString(key: string, fallback?: string): string | undefined;
  getNumber(key: string, fallback?: number): number | undefined;
  getBoolean(key: string, fallback?: boolean): boolean | undefined;
  getJson<T = unknown>(key: string, fallback?: T): T | undefined;
}

export interface EnvApi {
  get(key: string, fallback?: string): string | undefined;
  require(key: string): string;
  has(key: string): boolean;
  all(): Record<string, string>;
  getNumber(key: string, fallback?: number): number | undefined;
  getBoolean(key: string, fallback?: boolean): boolean | undefined;
  getJson<T = unknown>(key: string, fallback?: T): T | undefined;
}

export interface HttpRetryOptions {
  retries?: number;
  delayMs?: number;
  backoff?: number;
  maxDelayMs?: number;
  retryOnStatus?: number[];
}

export interface HttpRequestOptions {
  method?: HttpMethod;
  url: string;
  baseURL?: string;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | null | undefined>;
  json?: unknown;
  form?: Record<string, string | number | boolean | null | undefined>;
  body?: string | Uint8Array;
  timeoutMs?: number;
  retry?: number | HttpRetryOptions;
  responseType?: HttpResponseType;
  maxBytes?: number;
  acceptedStatus?: number[];
  followRedirects?: boolean;
}

export interface HttpResponse<T = unknown> {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: Record<string, string>;
  /** 原始 Set-Cookie 列表；headers['set-cookie'] 可能只保留最后一条。 */
  setCookies?: string[];
  data?: T;
  text?: string;
  base64?: string;
  finalUrl?: string;
  truncated?: boolean;
}

export interface HttpClient {
  request<T = unknown>(options: HttpRequestOptions): Promise<HttpResponse<T>>;
  get<T = unknown>(url: string, options?: Omit<HttpRequestOptions, 'url' | 'method'>): Promise<HttpResponse<T>>;
  post<T = unknown>(url: string, options?: Omit<HttpRequestOptions, 'url' | 'method'>): Promise<HttpResponse<T>>;
  put<T = unknown>(url: string, options?: Omit<HttpRequestOptions, 'url' | 'method'>): Promise<HttpResponse<T>>;
  patch<T = unknown>(url: string, options?: Omit<HttpRequestOptions, 'url' | 'method'>): Promise<HttpResponse<T>>;
  delete<T = unknown>(url: string, options?: Omit<HttpRequestOptions, 'url' | 'method'>): Promise<HttpResponse<T>>;
  head<T = unknown>(url: string, options?: Omit<HttpRequestOptions, 'url' | 'method'>): Promise<HttpResponse<T>>;
  json<T = unknown>(url: string, options?: Omit<HttpRequestOptions, 'url' | 'method'>): Promise<T>;
  getJson<T = unknown>(url: string, options?: Omit<HttpRequestOptions, 'url' | 'method'>): Promise<T>;
  postJson<T = unknown>(url: string, body: unknown, options?: Omit<HttpRequestOptions, 'url' | 'method' | 'json'>): Promise<T>;
}

export interface CacheApi {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;
  remember<T>(key: string, ttlSeconds: number | undefined, factory: () => Promise<T> | T): Promise<T>;
  increment(key: string, by?: number, ttlSeconds?: number): Promise<number>;
  touch(key: string, ttlSeconds: number): Promise<boolean>;
  clear(): Promise<void>;
  scope(scope: CacheScope): CacheApi;
}

/**
 * 日志第二个参数是结构化详情（data/details）。
 * 平台会随日志保存，并在运行详情里展开显示；适合放接口返回、错误响应等。
 */
export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
  success(message: string, data?: unknown): void;
  step(message: string, data?: unknown): void;
  progress(current: number, total: number, message?: string): void;
  child(fields: Record<string, unknown>): Logger;
}

export interface AesOptions {
  mode?: 'cbc' | 'ecb' | 'gcm';
  iv?: string;
  keyEncoding?: 'utf8' | 'base64' | 'hex';
  inputEncoding?: 'utf8' | 'base64' | 'hex';
  output?: 'base64' | 'hex';
  padding?: boolean;
  authTag?: string;
}

export interface CryptoApi {
  md5(input: BytesLike): string;
  sha1(input: BytesLike): string;
  sha256(input: BytesLike): string;
  sha512(input: BytesLike): string;
  hmac(
    algorithm: 'md5' | 'sha1' | 'sha256' | 'sha512',
    key: BytesLike,
    data: BytesLike,
    output?: 'hex' | 'base64',
  ): string;
  randomBytes(length: number, encoding?: 'hex' | 'base64' | 'base64url'): string;
  uuid(): string;
  base64Encode(input: BytesLike): string;
  base64Decode(input: string): string;
  hexEncode(input: BytesLike): string;
  hexDecode(input: string): string;
  urlEncode(input: string): string;
  urlDecode(input: string): string;
  aesEncrypt(input: BytesLike, key: string, ivOrOptions?: string | AesOptions): string;
  aesDecrypt(input: string, key: string, ivOrOptions?: string | AesOptions): string;
  rsaEncrypt(input: BytesLike, publicKeyPem: string, output?: 'base64' | 'hex'): string;
  rsaDecrypt(input: string, privateKeyPem: string, inputEncoding?: 'base64' | 'hex'): string;
  rsaSign(input: BytesLike, privateKeyPem: string, algorithm?: 'sha1' | 'sha256' | 'sha512'): string;
  rsaVerify(
    input: BytesLike,
    signature: string,
    publicKeyPem: string,
    algorithm?: 'sha1' | 'sha256' | 'sha512',
  ): boolean;
  constantTimeEqual(a: string, b: string): boolean;
}

export interface YybPhoneAuth {
  code?: string;
  authCode?: string;
  phone?: string;
  purePhoneNumber?: string;
  encryptedData?: string;
  iv?: string;
  data?: unknown;
  [key: string]: unknown;
}

export interface YybApi {
  getCode(options?: { ref?: string; appId?: string }): Promise<string>;
  getPhoneNumber(): Promise<string | null>;
  /** 获取完整手机号授权结果（含一次性 code），用于需要手机号授权的小程序注册。 */
  getPhoneAuth(options?: { appId?: string }): Promise<YybPhoneAuth | null>;
  operateWxData<T = unknown>(payload: unknown): Promise<T>;
  health(): Promise<{ ok: boolean; status?: number; body?: unknown }>;
  listAccounts<T = unknown>(): Promise<T[]>;
  refreshAccount(): Promise<unknown>;
}

export interface UserApi {
  getInfo(): Promise<UserInfo>;
  getPhone(): Promise<string | null>;
  getPoints(): Promise<number | null>;
}

export interface SessionApi {
  get<T = unknown>(): Promise<T | null>;
  save(value: unknown, expiresAt?: string | Date): Promise<void>;
  clear(): Promise<void>;
}

export interface AccountApi extends AccountInfo {
  session: SessionApi;
  refresh(): Promise<AccountInfo>;
}

export interface ProductInput {
  externalId: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  pointsCost: number;
  cashCost?: number | null;
  stock?: number | null;
  status?: string;
  limitPerUser?: number | null;
  startAt?: string | Date | null;
  endAt?: string | Date | null;
  raw?: unknown;
}

export interface ProductRecord extends Omit<ProductInput, 'startAt' | 'endAt'> {
  id: string;
  kind: ProductKind;
  startAt?: string | null;
  endAt?: string | null;
  firstSeenAt?: string;
  lastSeenAt?: string;
}

export interface ProductListOptions {
  status?: string;
  keyword?: string;
  limit?: number;
  includeOffShelf?: boolean;
}

export interface ProductSyncOptions {
  deactivateMissing?: boolean;
}

export interface ProductSyncResult {
  upserted: number;
  deactivated: number;
}

export interface ProductApi {
  list(options?: ProductListOptions): Promise<ProductRecord[]>;
  get(externalId: string): Promise<ProductRecord | null>;
  upsert(input: ProductInput): Promise<ProductRecord>;
  upsertMany(inputs: ProductInput[]): Promise<ProductRecord[]>;
  sync(inputs: ProductInput[], options?: ProductSyncOptions): Promise<ProductSyncResult>;
  update(externalId: string, patch: Partial<ProductInput>): Promise<ProductRecord>;
  setStock(externalId: string, stock: number | null): Promise<ProductRecord>;
  setStatus(externalId: string, status: string): Promise<ProductRecord>;
  remove(externalId: string): Promise<boolean>;
}

export interface PointsSnapshot {
  balance: number;
  currency: string;
  expiringAmount: number;
  nextExpiryAt?: string | null;
  rulesText?: string | null;
  estimated: boolean;
  lastSyncedAt?: string | null;
}

export interface PointTransactionInput {
  type: 'earn' | 'spend' | 'expire' | 'adjust' | string;
  amount: number;
  occurredAt?: string | Date;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  raw?: unknown;
}

export interface PointTransactionRecord extends Omit<PointTransactionInput, 'occurredAt'> {
  id: string;
  balanceAfter: number;
  occurredAt: string;
}

export interface PointLotInput {
  amount: number;
  grantedAt?: string | Date;
  expiresAt?: string | Date | null;
  source?: string;
  sourceRef?: string;
  estimated?: boolean;
}

export interface PointLotRecord extends Omit<PointLotInput, 'grantedAt' | 'expiresAt'> {
  id: string;
  remaining: number;
  grantedAt: string;
  expiresAt?: string | null;
}

export interface PointsApi {
  get(): Promise<PointsSnapshot | null>;
  sync(snapshot: Partial<PointsSnapshot>): Promise<PointsSnapshot>;
  add(
    delta: number,
    input?: Omit<PointTransactionInput, 'amount' | 'balanceAfter'>,
  ): Promise<PointsSnapshot>;
  spend(
    amount: number,
    input?: Omit<PointTransactionInput, 'amount' | 'balanceAfter'>,
  ): Promise<PointsSnapshot>;
  addLot(input: PointLotInput): Promise<PointLotRecord>;
  listTransactions(options?: { limit?: number }): Promise<PointTransactionRecord[]>;
  listLots(): Promise<PointLotRecord[]>;
}

export type ActivityFormFieldType =
  | 'text'
  | 'tel'
  | 'number'
  | 'date'
  | 'textarea'
  | 'select'
  | 'address';

export interface ActivityFormField {
  key: string;
  label: string;
  type?: ActivityFormFieldType;
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

export interface ActivityInput {
  externalId: string;
  name: string;
  type?: string;
  points?: number | null;
  status?: string;
  progressCurrent?: number | null;
  progressTarget?: number | null;
  startAt?: string | Date | null;
  endAt?: string | Date | null;
  action?: string;
  formSchema?: ActivityFormSchema | null;
  raw?: unknown;
}

export interface ActivityRecord extends Omit<ActivityInput, 'startAt' | 'endAt'> {
  id: string;
  startAt?: string | null;
  endAt?: string | null;
  scriptId?: string | null;
  lastSyncedAt?: string;
}

export interface ActivityApi {
  list(options?: { status?: string; limit?: number }): Promise<ActivityRecord[]>;
  get(externalId: string): Promise<ActivityRecord | null>;
  upsert(input: ActivityInput): Promise<ActivityRecord>;
  upsertMany(inputs: ActivityInput[]): Promise<ActivityRecord[]>;
  sync(inputs: ActivityInput[]): Promise<number>;
  setProgress(externalId: string, current: number, target?: number): Promise<ActivityRecord>;
  complete(externalId: string): Promise<ActivityRecord>;
}

export interface OrderInput {
  externalId?: string;
  productExternalId?: string;
  capability: 'redeem' | 'grab' | string;
  quantity: number;
  pointsCost?: number | null;
  cashCost?: number | null;
  status: 'pending' | 'success' | 'failed' | 'cancelled' | string;
  message?: string;
  raw?: unknown;
}

export interface OrderRecord extends Omit<OrderInput, 'externalId'> {
  id: string;
  externalId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface OrderApi {
  record(input: OrderInput): Promise<OrderRecord>;
  list(options?: { status?: string; limit?: number }): Promise<OrderRecord[]>;
  update(idOrExternalId: string, patch: Partial<OrderInput>): Promise<OrderRecord>;
}

export interface NotifyOptions {
  title?: string;
  body: string;
  level?: 'info' | 'success' | 'warn' | 'error';
  data?: unknown;
  channels?: string[];
}

export interface NotifyApi {
  send(options: NotifyOptions): Promise<void>;
  success(message: string, data?: unknown): Promise<void>;
  fail(message: string, data?: unknown): Promise<void>;
}

export interface ArtifactWriteOptions {
  contentType?: string;
  public?: boolean;
}

export interface ArtifactRecord {
  path: string;
  url?: string;
  bytes?: number;
}

export interface ArtifactApi {
  write(name: string, content: string | Uint8Array, options?: ArtifactWriteOptions): Promise<ArtifactRecord>;
  json(name: string, value: unknown): Promise<ArtifactRecord>;
}

export interface StateApi {
  get<T = unknown>(key: string, fallback?: T): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  all(): Promise<Record<string, unknown>>;
}

export interface TimeApi {
  now(): Date;
  timestamp(): number;
  iso(): string;
  offsetMs: number;
  sleep(ms: number): Promise<void>;
  sleepUntil(target: Date | string | number): Promise<void>;
}

export interface RetryOptions {
  retries?: number;
  delayMs?: number;
  backoff?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

export interface ScriptErrorOptions {
  retryable?: boolean;
  manual?: boolean;
  details?: unknown;
  cause?: unknown;
}

export interface ScriptContext {
  run: RunInfo;
  runId: string;
  dryRun: boolean;
  args: string[];
  input: Record<string, unknown>;
  app: AppInfo;
  site: AppInfo;
  account: AccountApi;
  session: SessionApi;
  user: UserApi;
  yyb: YybApi;
  http: HttpClient;
  cache: CacheApi;
  log: Logger;
  crypto: CryptoApi;
  env: EnvApi;
  config: ConfigApi;
  products: ProductApi;
  grab: ProductApi;
  points: PointsApi;
  activities: ActivityApi;
  orders: OrderApi;
  notify: NotifyApi;
  artifacts: ArtifactApi;
  state: StateApi;
  time: TimeApi;
  sleep(ms: number): Promise<void>;
  retry<T>(fn: () => Promise<T> | T, options?: RetryOptions): Promise<T>;
  assert(condition: unknown, message: string, code?: string): asserts condition;
  fail(code: string, message: string, options?: ScriptErrorOptions): never;
  businessError(code: string, message: string, options?: ScriptErrorOptions): ScriptError;
  authExpired(message: string, options?: ScriptErrorOptions): ScriptError;
  manualRequired(message: string, options?: ScriptErrorOptions): ScriptError;
}

export interface RunMetrics {
  pointsBefore?: number;
  pointsAfter?: number;
  earned?: number;
  spent?: number;
  durationMs?: number;
  [key: string]: number | undefined;
}

export interface RunResult {
  ok: boolean;
  capability?: Capability | string;
  message: string;
  errorCode?: string;
  alreadyDone?: boolean;
  metrics?: RunMetrics;
  data?: unknown;
  /** 失败时的结构化详情（如接口响应），会显示在运行详情中。 */
  details?: unknown;
  artifacts?: string[];
  nextActions?: string[];
  state?: Record<string, unknown>;
}

export interface Adapter {
  run(ctx: ScriptContext): Promise<RunResult> | RunResult;
}
