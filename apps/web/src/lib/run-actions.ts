import type { ActionFormField, Run } from './api';

export function runActionDetails(run: Run | null): {
  action: string;
  fields: ActionFormField[];
} {
  const summary = run?.summary as { details?: unknown } | null | undefined;
  const details =
    summary && summary.details && typeof summary.details === 'object'
      ? (summary.details as Record<string, unknown>)
      : {};
  const action = typeof details.action === 'string' ? details.action : '';
  const fields = Array.isArray(details.formSchema)
    ? (details.formSchema as ActionFormField[])
    : [];
  return { action, fields };
}
