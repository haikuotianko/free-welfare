import type {
  AccountInfo,
  ActivityApi,
  AppInfo,
  ArtifactApi,
  CacheScope,
  CryptoApi,
  HttpRequestOptions,
  HttpResponse,
  LogLevel,
  NotifyApi,
  OrderApi,
  PointLotRecord,
  PointTransactionInput,
  PointTransactionRecord,
  PointsSnapshot,
  ProductInput,
  ProductKind,
  ProductListOptions,
  ProductRecord,
  ProductSyncOptions,
  ProductSyncResult,
  RunInfo,
  ScriptMode,
  SessionApi,
  StateApi,
  UserApi,
  YybApi,
} from './types';

export type ScriptHostApp = Omit<AppInfo, 'config' | 'env'>;

export interface ScriptHostCache {
  get(scope: CacheScope, key: string): Promise<unknown | null>;
  set(scope: CacheScope, key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  delete(scope: CacheScope, key: string): Promise<boolean>;
  has(scope: CacheScope, key: string): Promise<boolean>;
  increment(scope: CacheScope, key: string, by?: number, ttlSeconds?: number): Promise<number>;
  touch(scope: CacheScope, key: string, ttlSeconds: number): Promise<boolean>;
  clear(scope: CacheScope): Promise<void>;
}

export interface ScriptHostProducts {
  list(kind: ProductKind, options?: ProductListOptions): Promise<ProductRecord[]>;
  get(kind: ProductKind, externalId: string): Promise<ProductRecord | null>;
  upsert(kind: ProductKind, input: ProductInput): Promise<ProductRecord>;
  upsertMany(kind: ProductKind, inputs: ProductInput[]): Promise<ProductRecord[]>;
  sync(
    kind: ProductKind,
    inputs: ProductInput[],
    options?: ProductSyncOptions,
  ): Promise<ProductSyncResult>;
  update(kind: ProductKind, externalId: string, patch: Partial<ProductInput>): Promise<ProductRecord>;
  setStock(kind: ProductKind, externalId: string, stock: number | null): Promise<ProductRecord>;
  setStatus(kind: ProductKind, externalId: string, status: string): Promise<ProductRecord>;
  remove(kind: ProductKind, externalId: string): Promise<boolean>;
}

export interface ScriptHostPoints {
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
  addLot(input: {
    amount: number;
    grantedAt?: string | Date;
    expiresAt?: string | Date | null;
    source?: string;
    sourceRef?: string;
    estimated?: boolean;
  }): Promise<PointLotRecord>;
  listTransactions(options?: { limit?: number }): Promise<PointTransactionRecord[]>;
  listLots(): Promise<PointLotRecord[]>;
}

export interface ScriptHostState {
  load(): Promise<Record<string, unknown>>;
  save(value: Record<string, unknown>): Promise<void>;
}

export interface ScriptHost {
  run: RunInfo;
  app: ScriptHostApp;
  account: AccountInfo;
  config: Record<string, unknown>;
  appConfig: Record<string, unknown>;
  env: Record<string, string>;
  input: Record<string, unknown>;
  mode: ScriptMode;
  offsetMs: number;
  cache: ScriptHostCache;
  http: { request(options: HttpRequestOptions): Promise<HttpResponse> };
  yyb: YybApi;
  user: UserApi;
  session: SessionApi;
  refreshAccount(): Promise<AccountInfo>;
  products: ScriptHostProducts;
  points: ScriptHostPoints;
  activities: ActivityApi;
  orders: OrderApi;
  notify: NotifyApi;
  artifacts: ArtifactApi;
  crypto: CryptoApi;
  state: ScriptHostState;
  log(level: LogLevel, message: string, data?: unknown): void;
}

export type ScriptHostInput = ScriptHost;
export type ScriptContextState = StateApi;
