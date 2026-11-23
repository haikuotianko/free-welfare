<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RefreshCw, Search, X } from 'lucide-vue-next';
import { api, type RunLogEntry, type RunLogPage, type Site } from '../lib/api';
import { labelOf, runStatusLabels } from '../lib/labels';
import { useAccountStore } from '../stores/account';
import Pagination from '../components/Pagination.vue';

const accountStore = useAccountStore();
const items = ref<RunLogEntry[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 50;
const query = ref('');
const accountQuery = ref('');
const siteQuery = ref('');
const statusFilter = ref('');
const levelFilter = ref('');
const from = ref('');
const to = ref('');
const loading = ref(true);
const error = ref('');
const sites = ref<Site[]>([]);
let searchTimer: ReturnType<typeof setTimeout> | null = null;

const statusOptions = Object.entries(runStatusLabels).map(([value, label]) => ({ value, label }));
const levelOptions = [
  { value: 'debug', label: '调试' },
  { value: 'info', label: '信息' },
  { value: 'warn', label: '警告' },
  { value: 'error', label: '错误' },
];

const hasFilters = computed(
  () =>
    Boolean(query.value.trim()) ||
    Boolean(accountQuery.value.trim()) ||
    Boolean(siteQuery.value.trim()) ||
    Boolean(statusFilter.value) ||
    Boolean(levelFilter.value) ||
    Boolean(from.value) ||
    Boolean(to.value),
);

function statusClass(status: string) {
  if (status === 'succeeded') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200';
  if (status === 'failed' || status === 'timeout') return 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200';
  if (status === 'running' || status === 'starting' || status === 'queued') {
    return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200';
  }
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

function levelClass(level: string) {
  if (level === 'error') return 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200';
  if (level === 'warn') return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200';
  if (level === 'debug') return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
  return 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-100';
}

function levelLabel(level: string) {
  return levelOptions.find((item) => item.value === level)?.label ?? level;
}

function formatTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function formatDuration(value?: number | null) {
  if (value === null || value === undefined) return '';
  return value < 1000 ? `${value}ms` : `${(value / 1000).toFixed(1)}s`;
}

function toIso(value: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function prettyData(data: unknown) {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const params = new URLSearchParams({
      page: String(page.value),
      pageSize: String(pageSize),
    });
    if (query.value.trim()) params.set('q', query.value.trim());
    if (accountQuery.value.trim()) params.set('account', accountQuery.value.trim());
    if (siteQuery.value.trim()) params.set('site', siteQuery.value.trim());
    if (statusFilter.value) params.set('status', statusFilter.value);
    if (levelFilter.value) params.set('level', levelFilter.value);
    const fromIso = toIso(from.value);
    const toIsoValue = toIso(to.value);
    if (fromIso) params.set('from', fromIso);
    if (toIsoValue) params.set('to', toIsoValue);

    const data = await api.get<RunLogPage>(`/logs?${params.toString()}`);
    total.value = data.total;
    const totalPages = Math.max(1, Math.ceil(data.total / pageSize));
    if (page.value > totalPages) {
      page.value = totalPages;
      return;
    }
    items.value = data.items;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载日志失败';
  } finally {
    loading.value = false;
  }
}

function scheduleLoad() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchTimer = null;
    void load();
  }, 300);
}

function resetFilters() {
  query.value = '';
  accountQuery.value = '';
  siteQuery.value = '';
  statusFilter.value = '';
  levelFilter.value = '';
  from.value = '';
  to.value = '';
  page.value = 1;
}

watch(
  [query, accountQuery, siteQuery, statusFilter, levelFilter, from, to],
  () => {
    if (page.value !== 1) {
      page.value = 1;
      return;
    }
    scheduleLoad();
  },
);

watch(page, () => {
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  void load();
});

onMounted(async () => {
  await Promise.allSettled([
    accountStore.load(),
    api.get<Site[]>('/sites').then((list) => {
      sites.value = list;
    }),
  ]);
  await load();
});

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer);
});
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 class="text-lg font-semibold">运行日志</h2>
        <p class="text-sm text-slate-500">
          所有运行日志持久保存在 PostgreSQL，不会自动清理；支持按内容、账号、应用、状态和时间筛选。
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button class="btn-ghost !px-3 !py-1.5" :disabled="loading" @click="load">
          <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loading }" /> 刷新
        </button>
        <RouterLink to="/runs" class="btn-ghost !px-3 !py-1.5">运行列表</RouterLink>
      </div>
    </div>

    <p v-if="error" class="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{{ error }}</p>

    <div class="card space-y-3">
      <div class="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <div class="relative md:col-span-2">
          <Search class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            v-model="query"
            type="text"
            maxlength="500"
            class="input !py-1.5 !pl-8 !pr-8 text-xs"
            placeholder="搜索日志内容"
          />
          <button
            v-if="query"
            type="button"
            class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
            title="清空搜索"
            @click="query = ''"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </div>
        <input
          v-model="accountQuery"
          list="log-account-options"
          autocomplete="off"
          class="input !py-1.5 text-xs"
          placeholder="账号名称或 ID"
        />
        <input
          v-model="siteQuery"
          list="log-site-options"
          autocomplete="off"
          class="input !py-1.5 text-xs"
          placeholder="应用名称、key 或 AppID"
        />
        <select v-model="statusFilter" class="input !py-1.5 text-xs">
          <option value="">全部状态</option>
          <option v-for="option in statusOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <select v-model="levelFilter" class="input !py-1.5 text-xs">
          <option value="">全部级别</option>
          <option v-for="option in levelOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <label class="text-[11px] text-slate-500">
          开始时间
          <input v-model="from" type="datetime-local" class="input !py-1.5 text-xs" />
        </label>
        <label class="text-[11px] text-slate-500">
          结束时间
          <input v-model="to" type="datetime-local" class="input !py-1.5 text-xs" />
        </label>
        <datalist id="log-account-options">
          <option v-for="account in accountStore.accounts" :key="account.id" :value="account.displayName">
            {{ account.id }} · {{ account.yybRef }}
          </option>
        </datalist>
        <datalist id="log-site-options">
          <option v-for="site in sites" :key="site.id" :value="site.name">
            {{ site.id }} · {{ site.key }} · {{ site.appId }}
          </option>
        </datalist>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>共 <b>{{ total }}</b> 条日志 · 按时间倒序</span>
        <button v-if="hasFilters" type="button" class="btn-ghost !px-2 !py-1 text-[11px]" @click="resetFilters">
          清空筛选
        </button>
      </div>
    </div>

    <div v-if="loading && items.length === 0" class="card py-10 text-center text-sm text-slate-500">加载中…</div>
    <div v-else-if="items.length === 0" class="card py-10 text-center text-sm text-slate-500">没有匹配的运行日志。</div>
    <div v-else class="card divide-y divide-slate-100 p-0 dark:divide-slate-800">
      <div v-for="log in items" :key="log.id" class="space-y-1 p-3">
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span class="font-mono text-[11px] text-slate-500">{{ formatTime(log.ts) }}</span>
          <span class="chip" :class="statusClass(log.runStatus)">{{ labelOf(runStatusLabels, log.runStatus) }}</span>
          <span class="chip" :class="levelClass(log.level)">{{ levelLabel(log.level) }}</span>
          <span class="text-[11px] text-slate-500">
            {{ log.accountName }} · {{ log.siteName }}<template v-if="log.scriptName"> · {{ log.scriptName }}</template>
          </span>
          <span v-if="log.durationMs != null" class="text-[11px] text-slate-400">{{ formatDuration(log.durationMs) }}</span>
          <RouterLink :to="`/runs?run=${log.runId}`" class="ml-auto text-[11px] font-medium text-brand-600 hover:underline dark:text-brand-300">
            运行详情
          </RouterLink>
        </div>
        <div
          class="whitespace-pre-wrap break-words text-sm"
          :class="log.level === 'error' ? 'text-red-600 dark:text-red-300' : log.level === 'warn' ? 'text-amber-700 dark:text-amber-200' : ''"
        >
          {{ log.message }}
        </div>
        <details v-if="log.data" class="text-[11px] text-slate-500">
          <summary class="cursor-pointer text-slate-400">附加数据</summary>
          <pre class="mt-1 max-h-48 overflow-auto rounded-lg bg-slate-950 p-2 text-slate-200">{{ prettyData(log.data) }}</pre>
        </details>
      </div>
    </div>

    <Pagination :page="page" :total="total" :page-size="pageSize" unit="条日志" @update:page="page = $event" />
  </div>
</template>
