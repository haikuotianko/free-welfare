import { z, type ZodTypeAny } from 'zod';
import { AppError } from './app-error';

export function zodErrorMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  const raw = issue?.message?.trim() ?? '';
  return raw === 'Required'
    ? '请填写必填项'
    : raw === 'Invalid input'
      ? '参数格式不正确'
      : raw || '请求参数不合法';
}

export function parseInput<S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError('validation_failed', zodErrorMessage(parsed.error), 400, parsed.error.flatten());
  }
  return parsed.data;
}
