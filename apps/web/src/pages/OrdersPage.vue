<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ReceiptText, RefreshCw } from 'lucide-vue-next';
import { api } from '../lib/api';
import { useAccountStore } from '../stores/account';
import Pagination from '../components/Pagination.vue';

interface OrderRow {
  id: string;
  capability: string;
  externalId?: string | null;
  productExternalId?: string | null;
  quantity: number;
  pointsCost?: number | null;
  cashCost?: number | null;
  status: string;
  message?: string | null;
  createdAt: string;
  site?: { id: string; name: string; key: string; pointsName: string };
  siteAccount?: { id: string; wechatAccount?: { id: string; displayName: string } };
}

const accountStore = useAccountStore();
const rows = ref<OrderRow[]>([]);
const loading = ref(false);
const error = ref('');
const page = ref(1);
const pageSize = 20;

const visibleRows = computed(() =>
  accountStore.selectedId
    ? rows.value.filter((row) => row.siteAccount?.wechatAccount?.id === accountStore.selectedId)
    : rows.value,
);
const pagedRows = computed(() =>
  visibleRows.value.slice((page.value - 1) * pageSize, page.value * pageSize),
);

watch(
  () => accountStore.selectedId,
  () => {
    page.value = 1;
  },
);
watch(
  () => visibleRows.value.length,
  (total) => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page.value > totalPages) page.value = totalPages;
  },
);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    rows.value = await api.get<OrderRow[]>('/orders');
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

function statusLabel(status: string) {
  if (status === 'success') return '成功';
  if (status === 'failed') return '失败';
  if (status === 'cancelled') return '已取消';
  return '处理中';
}

function statusClass(status: string) {
  if (status === 'success') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200';
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
          <ReceiptText class="h-5 w-5 text-brand-600" /> 兑换记录
        </h2>
        <p class="text-sm text-slate-500">脚本产生的兑换/抢购订单记录。</p>
        <p v-if="accountStore.selectedAccount" class="mt-1 text-xs text-brand-600 dark:text-brand-300">
          当前账号：{{ accountStore.selectedAccount.displayName }}
        </p>
        <p v-else class="mt-1 text-xs text-slate-500">当前显示全部账号，可在右上角切换。</p>
      </div>
      <button class="btn-ghost !px-3 !py-1.5" :disabled="loading" @click="load">
        <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loading }" /> 刷新
      </button>
    </div>

    <p v-if="error" class="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{{ error }}</p>

    <div v-if="visibleRows.length === 0" class="card flex flex-col items-center gap-3 py-10 text-center">
      <ReceiptText class="h-8 w-8 text-slate-400" />
      <div class="text-sm font-medium">{{ accountStore.selectedId ? '当前账号没有兑换记录' : '还没有兑换记录' }}</div>
      <p class="max-w-md text-sm text-slate-500">运行兑换脚本并确认提交后，记录会出现在这里。</p>
    </div>

    <div v-else class="card divide-y divide-slate-100 dark:divide-slate-800">
      <div v-for="row in pagedRows" :key="row.id" class="flex flex-wrap items-center justify-between gap-3 py-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-medium">{{ row.productExternalId ?? row.externalId ?? '订单' }}</span>
            <span class="chip" :class="statusClass(row.status)">{{ statusLabel(row.status) }}</span>
          </div>
          <div class="mt-1 text-xs text-slate-500">
            {{ row.site?.name ?? '应用' }} · {{ row.siteAccount?.wechatAccount?.displayName ?? '账号' }} ·
            {{ row.capability }} · {{ formatTime(row.createdAt) }}
          </div>
          <div v-if="row.message" class="mt-1 text-xs text-slate-500">{{ row.message }}</div>
        </div>
        <div class="text-right text-xs text-slate-500">
          <div>数量：{{ row.quantity }}</div>
          <div>{{ row.site?.pointsName ?? '积分' }}：{{ row.pointsCost ?? '—' }}</div>
        </div>
      </div>
    </div>

    <Pagination :page="page" :total="visibleRows.length" :page-size="pageSize" unit="条记录" @update:page="page = $event" />
  </div>
</template>
