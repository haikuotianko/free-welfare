<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { api, type Site, type YybRequestPage } from '../lib/api';
import { useAccountStore } from '../stores/account';
import Pagination from '../components/Pagination.vue';

const accountStore = useAccountStore();
const items = ref<YybRequestPage['items']>([]);
const total = ref(0);
const success = ref(0);
const failed = ref(0);
const page = ref(1);
const pageSize = 20;
const typeFilter = ref('');
const statusFilter = ref('');
const accountQuery = ref('');
const siteQuery = ref('');
const sites = ref<Site[]>([]);
const loading = ref(true);
const error = ref('');
let searchTimer: ReturnType<typeof setTimeout> | null = null;

const TYPE_OPTIONS = [
  { value: 'get-code', label: '取码' },
  { value: 'get-phone', label: '手机号授权' },
  { value: 'operate-wx-data', label: '小程序数据' },
  { value: 'refresh-account', label: '刷新账号' },
  { value: 'sync-accounts', label: '同步账号' },
  { value: 'qr-create', label: '创建扫码' },
  { value: 'qr-poll', label: '查询扫码' },
  { value: 'qr-confirm', label: '确认扫码' },
  { value: 'health', label: '健康检查' },
  { value: 'list-accounts', label: '账号列表' },
];
const TYPE_LABELS = Object.fromEntries(TYPE_OPTIONS.map((item) => [item.value, item.label]));

function typeLabel(type: string) {
  return TYPE_LABELS[type] ?? type;
}

function statusClass(status: string) {
  if (status === 'success') {
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200';
  }
  return 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200';
}

function formatTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function resetFilters() {
  typeFilter.value = '';
  statusFilter.value = '';
  accountQuery.value = '';
  siteQuery.value = '';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const params = new URLSearchParams({
      page: String(page.value),
      pageSize: String(pageSize),
    });
    if (typeFilter.value) params.set('type', typeFilter.value);
    if (statusFilter.value) params.set('status', statusFilter.value);
    if (accountQuery.value.trim()) params.set('account', accountQuery.value.trim());
    if (siteQuery.value.trim()) params.set('site', siteQuery.value.trim());
    const data = await api.get<YybRequestPage>(`/yyb/requests?${params.toString()}`);
    items.value = data.items;
    total.value = data.total;
    success.value = data.success;
    failed.value = data.failed;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

watch([typeFilter, statusFilter, accountQuery, siteQuery], () => {
  if (page.value !== 1) {
    page.value = 1;
    return;
  }
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchTimer = null;
    void load();
  }, 300);
});

watch(page, () => {
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  void load();
});

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer);
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
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 class="text-lg font-semibold">YYB 请求</h2>
        <p class="text-sm text-slate-500">
          YYB 服务的全部请求记录：取码、手机号授权、扫码、账号同步和刷新等。
        </p>
      </div>
      <button class="btn-ghost" :disabled="loading" @click="load">刷新</button>
    </div>

    <div class="card space-y-3">
      <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <select v-model="typeFilter" class="input !py-1.5 text-xs">
          <option value="">全部类型</option>
          <option v-for="option in TYPE_OPTIONS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <select v-model="statusFilter" class="input !py-1.5 text-xs">
          <option value="">全部状态</option>
          <option value="success">成功</option>
          <option value="failed">失败</option>
        </select>
        <input
          v-model="accountQuery"
          list="yyb-account-options"
          autocomplete="off"
          class="input !py-1.5 text-xs"
          placeholder="账号名称或 ID"
        />
        <input
          v-model="siteQuery"
          list="yyb-site-options"
          autocomplete="off"
          class="input !py-1.5 text-xs"
          placeholder="应用名称或 ID"
        />
        <datalist id="yyb-account-options">
          <option v-for="account in accountStore.accounts" :key="account.id" :value="account.displayName">
            {{ account.id }}
          </option>
        </datalist>
        <datalist id="yyb-site-options">
          <option v-for="site in sites" :key="site.id" :value="site.name">{{ site.id }}</option>
        </datalist>
      </div>
      <div class="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>共 <b>{{ total }}</b> 条</span>
        <span class="chip bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
          成功 {{ success }}
        </span>
        <span class="chip bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200">
          失败 {{ failed }}
        </span>
        <span class="text-slate-400">按时间倒序</span>
        <button
          v-if="typeFilter || statusFilter || accountQuery || siteQuery"
          type="button"
          class="btn-ghost ml-auto !px-2 !py-1 text-[11px]"
          @click="resetFilters"
        >
          清空筛选
        </button>
      </div>
    </div>

    <p v-if="error" class="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
      {{ error }}
    </p>

    <div v-if="loading && items.length === 0" class="card py-10 text-center text-sm text-slate-500">
      加载中…
    </div>
    <div v-else-if="items.length === 0" class="card py-10 text-center text-sm text-slate-500">
      没有匹配的请求记录。
    </div>
    <div v-else class="card divide-y divide-slate-100 p-0 dark:divide-slate-800">
      <div v-for="log in items" :key="log.id" class="space-y-1 p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-medium">{{ typeLabel(log.type) }}</span>
            <span class="chip" :class="statusClass(log.status)">
              {{ log.status === 'success' ? '成功' : '失败' }}
            </span>
            <span class="text-xs text-slate-500">{{ formatTime(log.createdAt) }}</span>
          </div>
          <div class="text-xs text-slate-500">
            {{ log.durationMs ?? '—' }}ms · HTTP {{ log.httpStatus ?? '—' }}
          </div>
        </div>
        <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
          <span v-if="log.wechatAccountName">账号：{{ log.wechatAccountName }}</span>
          <span v-if="log.siteName">应用：{{ log.siteName }}</span>
          <span class="min-w-0 break-all font-mono">{{ log.method }} {{ log.path }}</span>
          <span>{{ log.source === 'worker' ? 'Worker / 脚本' : '平台' }}</span>
        </div>
        <p v-if="log.errorMessage" class="break-words text-xs text-red-600 dark:text-red-300">
          {{ log.errorMessage }}
        </p>
      </div>
    </div>

    <Pagination
      :page="page"
      :total="total"
      :page-size="pageSize"
      unit="条请求"
      @update:page="page = $event"
    />
  </div>
</template>
