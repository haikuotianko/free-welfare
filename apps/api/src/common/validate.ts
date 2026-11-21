import { z, type ZodTypeAny } from 'zod';
import { AppError } from './app-error';

export function parseInput<S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError('validation_failed', '请求参数不合法', 400, parsed.error.flatten());
  }
  return parsed.data;
}
