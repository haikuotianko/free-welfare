<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Bell, RefreshCw } from 'lucide-vue-next';
import { api } from '../lib/api';
import Pagination from '../components/Pagination.vue';

interface NotificationRow {
  id: string;
  channel: string;
  eventType: string;
  title: string;
  body: string;
  status: string;
  error?: string | null;
  sentAt?: string | null;
  createdAt: string;
}

const rows = ref<NotificationRow[]>([]);
const loading = ref(false);
const error = ref('');
const page = ref(1);
const pageSize = 20;
const pagedRows = computed(() =>
  rows.value.slice((page.value - 1) * pageSize, page.value * pageSize),
);

watch(
  () => rows.value.length,
  (total) => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page.value > totalPages) page.value = totalPages;
  },
);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    rows.value = await api.get<NotificationRow[]>('/notifications');
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

function statusLabel(status: string) {
  if (status === 'sent') return '已发送';
  if (status === 'failed') return '失败';
  return '待发送';
}

function statusClass(status: string) {
  if (status === 'sent') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200';
  if (status === 'failed') return 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200';
  return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200';
}

function formatTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

onMounted(load);
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 class="flex items-center gap-2 text-lg font-semibold">
          <Bell class="h-5 w-5 text-brand-600" /> 通知记录
        </h2>
        <p class="text-sm text-slate-500">脚本、测试和系统通知的发送记录。</p>
      </div>
      <button class="btn-ghost !px-3 !py-1.5" :disabled="loading" @click="load">
        <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loading }" /> 刷新
      </button>
    </div>

    <p v-if="error" class="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{{ error }}</p>

    <div v-if="rows.length === 0" class="card flex flex-col items-center gap-3 py-10 text-center">
      <Bell class="h-8 w-8 text-slate-400" />
      <div class="text-sm font-medium">还没有通知</div>
      <p class="max-w-md text-sm text-slate-500">脚本调用 `ctx.notify` 或设置页测试通知后，记录会出现在这里。</p>
    </div>

    <div v-else class="space-y-2">
      <div v-for="row in pagedRows" :key="row.id" class="card">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-medium">{{ row.title }}</span>
              <span class="chip" :class="statusClass(row.status)">{{ statusLabel(row.status) }}</span>
              <span class="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{{ row.channel }}</span>
            </div>
            <div class="mt-1 text-xs text-slate-500">{{ row.eventType }} · {{ formatTime(row.createdAt) }}</div>
          </div>
          <div class="text-xs text-slate-500">{{ row.sentAt ? `发送：${formatTime(row.sentAt)}` : '' }}</div>
        </div>
        <p class="mt-2 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{{ row.body }}</p>
        <p v-if="row.error" class="mt-2 break-all text-xs text-red-600 dark:text-red-300">{{ row.error }}</p>
      </div>
    </div>

    <Pagination :page="page" :total="rows.length" :page-size="pageSize" unit="条通知" @update:page="page = $event" />
  </div>
</template>
