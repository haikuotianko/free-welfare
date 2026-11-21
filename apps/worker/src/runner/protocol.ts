import type { LogLevel, RunInfo, ScriptMode } from '@free-welfare/sdk';

export interface ScriptWorkerApp {
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
}

export interface ScriptWorkerAccount {
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

export interface ScriptWorkerData {
  run: RunInfo;
  mode: ScriptMode;
  filename: string;
  workspaceRoot: string;
  app: ScriptWorkerApp;
  appConfig: Record<string, unknown>;
  config: Record<string, unknown>;
  env: Record<string, string>;
  account: ScriptWorkerAccount;
  args: string[];
  input: Record<string, unknown>;
  allowedOrigins: string[];
  networkMode: string;
}

export interface RpcRequestMessage {
  type: 'rpc';
  id: number;
  method: string;
  args: unknown[];
}

export interface LogMessage {
  type: 'log';
  level: LogLevel;
  message: string;
  data?: unknown;
}

export interface ResultMessage {
  type: 'result';
  result: unknown;
}

export interface ErrorMessage {
  type: 'error';
  error: {
    code: string;
    message: string;
    retryable?: boolean;
    manual?: boolean;
    details?: unknown;
  };
}

export type WorkerToParentMessage = RpcRequestMessage | LogMessage | ResultMessage | ErrorMessage;

export interface RpcResultMessage {
  type: 'rpc-result';
  id: number;
  ok: boolean;
  value?: unknown;
  error?: { code: string; message: string; details?: unknown };
}

export type ParentToWorkerMessage = RpcResultMessage;
