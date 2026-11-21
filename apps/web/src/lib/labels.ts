import type { QueueTicket } from './api';

export function queueTicketText(queue?: QueueTicket | null): string {
  if (!queue) return '';
  if (queue.willStartImmediately) return '已开始执行';
  return `已加入队列：第 ${queue.position} 位，前方 ${queue.ahead} 个`;
}

export const accountStatusLabels: Record<string, string> = {
  alive: '可用',
  session_only: '部分可用',
  unknown: '未知',
  expired: '需重扫',
  disabled: '已停用',
  active: '正常',
  login_required: '需登录',
  phone_required: '需手机号',
  registered: '已注册',
  error: '异常',
};

export const runStatusLabels: Record<string, string> = {
  starting: '启动中',
  queued: '排队中',
  running: '运行中',
  succeeded: '成功',
  failed: '失败',
  canceled: '已取消',
  timeout: '超时',
  skipped: '已跳过',
};

export const registrationModeLabels: Record<string, string> = {
  unknown: '注册状态未确认',
  none: '无需注册',
  auto: '自动注册',
  one_click: '支持一键注册',
  manual: '需手动注册',
};

export function registrationModeClass(mode: string): string {
  if (mode === 'auto' || mode === 'one_click' || mode === 'none') {
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200';
  }
  if (mode === 'manual') {
    return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200';
  }
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

export const networkModeLabels: Record<string, string> = {
  whitelist: '白名单',
  unrestricted: '不限制',
};

export const scriptModeLabels: Record<string, string> = {
  platform: '平台 SDK',
  qinglong: '青龙兼容',
};

export const siteStatusLabels: Record<string, string> = {
  active: '启用',
  disabled: '停用',
  broken: '异常',
};

export const capabilityLabels: Record<string, string> = {
  login: '登录',
  register: '注册',
  sign_in: '签到',
  points: '积分',
  products: '商品',
  activities: '活动',
  redeem: '兑换',
  grab: '抢购',
};

export const scriptKindLabels: Record<string, string> = {
  action: '功能脚本',
  common: '公共模块',
};

export const trustLevelLabels: Record<string, string> = {
  official: '官方',
  community: '社区',
  custom: '自定义',
};

export const reviewStatusLabels: Record<string, string> = {
  reviewed: '已审核',
  community: '社区',
  custom: '自定义',
};

export function labelOf(map: Record<string, string>, value?: string | null): string {
  if (!value) return '—';
  return map[value] ?? value;
}
