<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { RefreshCw } from 'lucide-vue-next';
import { api, type QueueStatus, type Run } from '../lib/api';
import { labelOf, runStatusLabels } from '../lib/labels';
import { subscribeRunEvents } from '../stores/runEvents';

interface DashboardSummary {
  day: string;
  accounts: { total: number; alive: number; sessionOnly: number; expired: number };
  sites: number;
  scripts: { installed: number; app: number; sources: number };
  runs: {
    total: number;
    today: number;
    todaySucceeded: number;
    todayFailed: number;
    queued: number;
    running: number;
    successRate: number | null;
    recent: Run[];
  };
  points: {
    total: number;
    expiring: number;
    nextExpiryAt: string | null;
    accounts: number;
    byName: Array<{ name: string; total: number; expiring: number; accounts: number }>;
  };
  products: { total: number; onSale: number; lowStock: number; totalStock: number };
  grab: { total: number; onSale: number; lowStock: number };
  activities: { total: number; completed: number };
  orders: { total: number; success: number; failed: number };
  yyb: { total: number; success: number; failed: number };
  notifications: {
    total: number;
    failed: number;
    recent: Array<{ id: string; title: string; body: string; status: string; createdAt: string }>;
  };
  schedules: Array<{
    id: string;
    name: string;
    filePath: string;
    cron: string;
    nextRunAt: string | null;
    site: { id: string; key: string; name: string };
  }>;
}

const router = useRouter();
const summary = ref<DashboardSummary | null>(null);
const queueLive = ref<QueueStatus | null>(null);
const health = ref<{ ok: boolean; database: string; version: string } | null>(null);
const error = ref('');
const loading = ref(false);
const refreshing = ref(false);
const updatedAt = ref<number | null>(null);
const nowMs = ref(Date.now());

const CACHE_TTL_MS = 5 * 60_000;

interface CachedDashboard {
  cachedAt: number;
  health: { ok: boolean; database: string; version: string } | null;
  summary: DashboardSummary;
}

function cacheKey(accountId: string) {
  return `fw-dashboard:v2:${accountId || 'all'}`;
}

function readCache(accountId: string): CachedDashboard | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(accountId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedDashboard;
    if (!parsed || typeof parsed.cachedAt !== 'number' || !parsed.summary) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(accountId: string, value: CachedDashboard) {
  try {
    sessionStorage.setItem(cacheKey(accountId), JSON.stringify(value));
  } catch {
    // 隐私模式或存储空间不足时忽略，缓存失败不影响页面使用。
  }
}

function applyCache(cached: CachedDashboard) {
  summary.value = cached.summary;
  health.value = cached.health;
  updatedAt.value = cached.cachedAt;
  loading.value = false;
}

function hydrateFromCache() {
  const cached = readCache('all');
  if (cached) applyCache(cached);
  return cached;
}

const successRate = computed(() => summary.value?.runs.successRate ?? 0);
const queueCounts = computed(() => ({
  running: queueLive.value?.active.running ?? summary.value?.runs.running ?? 0,
  starting: queueLive.value?.active.starting ?? 0,
  queued: queueLive.value?.active.queued ?? summary.value?.runs.queued ?? 0,
}));
const pointsLabel = computed(() => {
  const groups = summary.value?.points.byName ?? [];
  if (groups.length === 0) return '积分';
  return groups.length === 1 ? groups[0].name : '积分总数';
});

function go(path: string) {
  void router.push(path);
}

function scheduleExpiry(delayMs: number) {
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = setTimeout(() => {
    expiryTimer = null;
    void fetchDashboard();
  }, Math.max(1000, delayMs));
}

async function fetchDashboard(force = false) {
  const cached = readCache('all');
  const age = cached ? Date.now() - cached.cachedAt : Number.POSITIVE_INFINITY;

  if (!force && cached) applyCache(cached);
  if (!force && cached && age < CACHE_TTL_MS) {
    // 5 分钟内的缓存可以直接使用，到期后再自动刷新。
    scheduleExpiry(CACHE_TTL_MS - age);
    return;
  }

  if (!summary.value) loading.value = true;
  refreshing.value = true;
  error.value = '';
  lastFetchAt = Date.now();
  const requestId = ++requestSeq;
  try {
    const [h, data] = await Promise.all([
      api.get<{ ok: boolean; database: string; version: string }>('/health'),
      api.get<DashboardSummary>('/dashboard'),
    ]);
    health.value = h;
    summary.value = data;
    updatedAt.value = Date.now();
    writeCache('all', { cachedAt: updatedAt.value, health: h, summary: data });
    scheduleExpiry(CACHE_TTL_MS);
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
    // 有缓存时继续展示旧数据，稍后自动重试。
    scheduleExpiry(summary.value ? 60_000 : 15_000);
  } finally {
    if (requestId === requestSeq) {
      loading.value = false;
      refreshing.value = false;
    }
  }
}

let expiryTimer: ReturnType<typeof setTimeout> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let clockTimer: ReturnType<typeof setInterval> | null = null;
let queueTimer: ReturnType<typeof setInterval> | null = null;
let unsubscribeEvents: (() => void) | null = null;
let requestSeq = 0;
let lastFetchAt = 0;

async function loadQueue() {
  try {
    queueLive.value = await api.get<QueueStatus>('/queue');
  } catch {
    // 保留上一次队列数据，下一页轮询再试。
  }
}

function scheduleRefresh() {
  if (refreshTimer) return;
  const wait = Math.max(250, 5000 - (Date.now() - lastFetchAt));
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    if (refreshing.value) {
      scheduleRefresh();
      return;
    }
    void fetchDashboard(true);
  }, wait);
}

function statusClass(status: string) {
  if (status === 'succeeded' || status === 'alive') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200';
  if (status === 'failed' || status === 'expired' || status === 'timeout') return 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200';
  if (status === 'running' || status === 'starting' || status === 'queued' || status === 'session_only') return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

function formatTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('zh-CN');
}

function formatClock(value: number | null) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
}

function isSoon(value?: string | null) {
  if (!value) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= nowMs.value + 60_000;
}

// 首屏优先使用缓存，避免每次进入总览都要等接口。
hydrateFromCache();
if (!summary.value) loading.value = true;

onMounted(() => {
  unsubscribeEvents = subscribeRunEvents((event) => {
    if (event.type === 'run' || event.type === 'sync') scheduleRefresh();
  });
  void fetchDashboard();
  void loadQueue();
  // 队列单独 3 秒刷新，不受总览 5 分钟缓存影响。
  queueTimer = setInterval(() => {
    if (!document.hidden) void loadQueue();
  }, 3000);
  // 只刷新“即将运行”等时间文本，不触发接口请求。
  clockTimer = setInterval(() => {
    nowMs.value = Date.now();
  }, 30_000);
});

onUnmounted(() => {
  if (expiryTimer) clearTimeout(expiryTimer);
  if (refreshTimer) clearTimeout(refreshTimer);
  if (clockTimer) clearInterval(clockTimer);
  if (queueTimer) clearInterval(queueTimer);
  unsubscribeEvents?.();
  unsubscribeEvents = null;
});
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 class="text-lg font-semibold">今天怎么样？</h2>
        <p class="text-sm text-slate-500">
          当前账号：全部账号 · {{ summary?.day ?? '—' }}
          <span v-if="updatedAt" class="text-xs text-slate-400">· 更新于 {{ formatClock(updatedAt) }}</span>
        </p>
        <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span class="chip" :class="health?.ok ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200'">
            API {{ loading ? '检查中…' : health?.ok ? '正常' : '异常' }}
          </span>
          <span class="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">DB {{ loading ? '—' : health?.database ?? '—' }}</span>
          <span v-if="health?.version" class="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">v{{ health.version }}</span>
        </div>
      </div>
      <button class="btn-ghost" :disabled="refreshing" @click="fetchDashboard(true)">
        <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': refreshing }" />
        {{ refreshing ? '刷新中…' : '刷新' }}
      </button>
    </div>

    <div class="flex flex-wrap gap-2">
      <RouterLink to="/accounts" class="btn-ghost !py-1.5">账号</RouterLink>
      <RouterLink to="/sites" class="btn-ghost !py-1.5">应用</RouterLink>
      <RouterLink to="/store" class="btn-ghost !py-1.5">应用商店</RouterLink>
      <RouterLink to="/products" class="btn-ghost !py-1.5">商品</RouterLink>
      <RouterLink to="/activities" class="btn-ghost !py-1.5">活动</RouterLink>
      <RouterLink to="/forms" class="btn-ghost !py-1.5">表单</RouterLink>
      <RouterLink to="/runs" class="btn-ghost !py-1.5">运行</RouterLink>
      <RouterLink to="/yyb-requests" class="btn-ghost !py-1.5">YYB 请求</RouterLink>
    </div>

    <p v-if="error" class="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{{ error }}</p>

    <template v-if="!summary && loading">
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="i in 4" :key="`sk-stat-${i}`" class="card animate-pulse">
          <div class="h-3 w-20 rounded bg-slate-200 dark:bg-slate-700" />
          <div class="mt-3 h-7 w-24 rounded bg-slate-200 dark:bg-slate-700" />
          <div class="mt-3 h-3 w-32 rounded bg-slate-200 dark:bg-slate-700" />
        </div>
      </div>
      <div class="grid gap-4 lg:grid-cols-3">
        <div class="card animate-pulse lg:col-span-2">
          <div class="mb-3 flex items-center justify-between">
            <div class="h-4 w-20 rounded bg-slate-200 dark:bg-slate-700" />
            <div class="h-3 w-14 rounded bg-slate-200 dark:bg-slate-700" />
          </div>
          <div class="space-y-2">
            <div
              v-for="i in 4"
              :key="`sk-run-${i}`"
              class="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800"
            >
              <div class="min-w-0 flex-1 space-y-2">
                <div class="h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
                <div class="h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
              </div>
              <div class="h-5 w-12 rounded-full bg-slate-200 dark:bg-slate-700" />
            </div>
          </div>
        </div>
        <div class="card animate-pulse">
          <div class="mb-3 flex items-center justify-between">
            <div class="h-4 w-20 rounded bg-slate-200 dark:bg-slate-700" />
            <div class="h-3 w-10 rounded bg-slate-200 dark:bg-slate-700" />
          </div>
          <div class="space-y-2">
            <div
              v-for="i in 3"
              :key="`sk-schedule-${i}`"
              class="rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800"
            >
              <div class="h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
              <div class="mt-2 h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
              <div class="mt-2 h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
            </div>
          </div>
        </div>
      </div>
    </template>

    <div
      v-if="queueCounts.running > 0 || queueCounts.starting > 0 || queueCounts.queued > 0"
      class="card flex flex-wrap items-center justify-between gap-3 border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/20"
    >
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <span class="chip bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200">运行队列</span>
        <span v-if="queueCounts.running > 0">运行中 <b>{{ queueCounts.running }}</b></span>
        <span v-if="queueCounts.starting > 0">启动中 <b>{{ queueCounts.starting }}</b></span>
        <span v-if="queueCounts.queued > 0">排队中 <b>{{ queueCounts.queued }}</b></span>
        <span class="text-xs text-slate-500">队列 3 秒实时刷新</span>
      </div>
      <RouterLink to="/runs" class="btn-ghost !px-3 !py-1.5">查看队列</RouterLink>
    </div>

    <div v-if="summary" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div class="card cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md" @click="go('/runs')">
        <div class="text-xs text-slate-500">今日运行</div>
        <div class="mt-1 flex items-end gap-2">
          <div class="text-2xl font-semibold">{{ summary.runs.today }}</div>
          <div class="pb-1 text-xs text-slate-500">次</div>
        </div>
        <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div class="h-full rounded-full bg-emerald-500" :style="{ width: `${successRate}%` }" />
        </div>
        <div class="mt-1 text-xs text-slate-500">
          成功 {{ summary.runs.todaySucceeded }} · 失败 {{ summary.runs.todayFailed }}
          <span v-if="summary.runs.successRate !== null"> · {{ summary.runs.successRate }}%</span>
        </div>
      </div>

      <div class="card cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md" @click="go('/accounts')">
        <div class="text-xs text-slate-500">{{ pointsLabel }}</div>
        <div class="mt-1 text-2xl font-semibold">{{ summary.points.total }}</div>
        <div class="mt-1 text-xs text-slate-500">
          即将过期 {{ summary.points.expiring }} · {{ summary.points.accounts }} 个账号
        </div>
        <div class="mt-2 text-xs text-slate-500">截止：{{ formatDate(summary.points.nextExpiryAt) }}</div>
      </div>

      <div class="card cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md" @click="go('/products')">
        <div class="text-xs text-slate-500">商品</div>
        <div class="mt-1 flex items-end gap-2">
          <div class="text-2xl font-semibold">{{ summary.products.total }}</div>
          <div class="pb-1 text-xs text-slate-500">个</div>
        </div>
        <div class="mt-1 text-xs text-slate-500">
          可兑换 {{ summary.products.onSale }} · 低库存 {{ summary.products.lowStock }}
        </div>
        <div class="mt-2 text-xs text-slate-500">总库存 {{ summary.products.totalStock }}</div>
      </div>

      <div class="card cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md" @click="go('/accounts')">
        <div class="text-xs text-slate-500">微信账号</div>
        <div class="mt-1 text-2xl font-semibold">{{ summary.accounts.total }}</div>
        <div class="mt-1 text-xs text-slate-500">
          可用 {{ summary.accounts.alive }} · 部分 {{ summary.accounts.sessionOnly }} · 失效 {{ summary.accounts.expired }}
        </div>
      </div>

      <div class="card cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md" @click="go('/sites')">
        <div class="text-xs text-slate-500">应用 / 脚本</div>
        <div class="mt-1 flex items-end gap-2">
          <div class="text-2xl font-semibold">{{ summary.sites }}</div>
          <div class="pb-1 text-xs text-slate-500">应用</div>
        </div>
        <div class="mt-1 text-xs text-slate-500">
          应用脚本 {{ summary.scripts.app }} · 订阅源 {{ summary.scripts.sources }}
        </div>
      </div>

      <div class="card cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md" @click="go('/activities')">
        <div class="text-xs text-slate-500">活动</div>
        <div class="mt-1 flex items-end gap-2">
          <div class="text-2xl font-semibold">{{ summary.activities.total }}</div>
          <div class="pb-1 text-xs text-slate-500">个</div>
        </div>
        <div class="mt-1 text-xs text-slate-500">已完成 {{ summary.activities.completed }}</div>
        <div class="mt-2 text-xs text-slate-500">签到、任务等同步状态</div>
      </div>

      <div class="card cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md" @click="go('/orders')">
        <div class="text-xs text-slate-500">兑换记录</div>
        <div class="mt-1 flex items-end gap-2">
          <div class="text-2xl font-semibold">{{ summary.orders.total }}</div>
          <div class="pb-1 text-xs text-slate-500">单</div>
        </div>
        <div class="mt-1 text-xs text-slate-500">
          成功 {{ summary.orders.success }} · 失败 {{ summary.orders.failed }}
        </div>
        <div class="mt-2 text-xs text-slate-500">
          通知 {{ summary.notifications.total }} · 失败 {{ summary.notifications.failed }}
        </div>
      </div>

      <div class="card cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md" @click="go('/yyb-requests')">
        <div class="text-xs text-slate-500">今日 YYB 请求</div>
        <div class="mt-1 flex items-end gap-2">
          <div class="text-2xl font-semibold">{{ summary.yyb?.total ?? 0 }}</div>
          <div class="pb-1 text-xs text-slate-500">次</div>
        </div>
        <div class="mt-1 text-xs text-slate-500">
          成功 {{ summary.yyb?.success ?? 0 }} · 失败 {{ summary.yyb?.failed ?? 0 }}
        </div>
        <div class="mt-2 text-xs text-slate-500">取码、手机号、扫码、同步等</div>
      </div>
    </div>

    <div v-if="summary" class="grid gap-4 lg:grid-cols-3">
      <div class="card lg:col-span-2">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-sm font-semibold">最近运行</h3>
          <RouterLink to="/runs" class="text-xs text-brand-600 hover:underline">查看全部</RouterLink>
        </div>
        <div v-if="!summary?.runs.recent.length" class="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
          还没有运行记录。在应用详情添加脚本后点“运行”。
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="run in summary.runs.recent"
            :key="run.id"
            class="flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
            @click="go('/runs')"
          >
            <div class="min-w-0">
              <div class="truncate">
                {{ run.site?.name ?? run.task?.binding?.site?.name ?? '应用' }} ·
                {{ run.siteScript?.name ?? run.task?.capability ?? '任务' }}
              </div>
              <div class="text-xs text-slate-500">
                {{ formatTime(run.createdAt) }} · {{ run.durationMs ?? '—' }}ms
              </div>
            </div>
            <span class="chip" :class="statusClass(run.status)">{{ labelOf(runStatusLabels, run.status) }}</span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-sm font-semibold">下次定时</h3>
          <RouterLink to="/sites" class="text-xs text-brand-600 hover:underline">应用</RouterLink>
        </div>
        <div v-if="!summary?.schedules.length" class="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">
          还没有启用中的定时脚本。
        </div>
        <div v-else class="space-y-2">
          <div v-for="item in summary.schedules" :key="item.id" class="cursor-pointer rounded-xl border border-slate-200 px-3 py-2 text-sm transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60" @click="go(`/sites/${item.site.id}`)">
            <div class="flex items-center justify-between gap-2">
              <div class="truncate font-medium">{{ item.name }}</div>
              <span v-if="isSoon(item.nextRunAt)" class="chip bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200">即将运行</span>
            </div>
            <div class="text-xs text-slate-500">{{ item.site.name }}</div>
            <div class="mt-1 text-xs text-slate-500">{{ item.cron }} · {{ formatTime(item.nextRunAt) }}</div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="summary?.notifications.recent.length" class="card">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="text-sm font-semibold">最近通知</h3>
        <RouterLink to="/notifications" class="text-xs text-brand-600 hover:underline">查看全部</RouterLink>
      </div>
      <div class="space-y-2">
        <div v-for="item in summary.notifications.recent" :key="item.id" class="cursor-pointer rounded-xl border border-slate-200 px-3 py-2 text-sm transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60" @click="go('/notifications')">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="font-medium">{{ item.title }}</span>
            <span class="text-xs text-slate-500">{{ formatTime(item.createdAt) }}</span>
          </div>
          <p class="mt-1 line-clamp-2 text-xs text-slate-500">{{ item.body }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
