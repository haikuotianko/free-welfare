import type { ScriptErrorOptions } from './types';

export class ScriptError extends Error {
  readonly code: string;
  readonly manual: boolean;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(code: string, message: string, options: ScriptErrorOptions = {}) {
    super(message);
    this.name = 'ScriptError';
    this.code = code;
    this.manual = options.manual ?? false;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export const scriptErrors = {
  business: (code: string, message: string, options?: ScriptErrorOptions) =>
    new ScriptError(code, message, options),
  authExpired: (message: string, options?: ScriptErrorOptions) =>
    new ScriptError('auth_expired', message, { ...options, manual: true }),
  manualRequired: (message: string, options?: ScriptErrorOptions) =>
    new ScriptError('manual_required', message, { ...options, manual: true }),
  retryable: (code: string, message: string, options?: ScriptErrorOptions) =>
    new ScriptError(code, message, { ...options, retryable: true }),
  network: (message: string, options?: ScriptErrorOptions) =>
    new ScriptError('network_error', message, { ...options, retryable: true }),
  rateLimited: (message: string, options?: ScriptErrorOptions) =>
    new ScriptError('rate_limited', message, { ...options, retryable: true }),
};
