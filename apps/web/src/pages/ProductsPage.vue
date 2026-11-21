<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Package, QrCode, RefreshCw, Search, X } from 'lucide-vue-next';
import { api, type AccountOverview } from '../lib/api';
import { useAccountStore } from '../stores/account';
import Pagination from '../components/Pagination.vue';

interface ProductRow {
  id: string;
  kind: string;
  externalId: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  pointsCost: number;
  cashCost?: number | null;
  stock?: number | null;
  status: string;
  limitPerUser?: number | null;
  startAt?: string | null;
  endAt?: string | null;
  lastSeenAt: string;
  raw?: Record<string, unknown> | null;
  site?: {
    id: string;
    name: string;
    key: string;
    appId?: string;
    iconUrl?: string | null;
    pointsName: string;
    metadata?: Record<string, unknown> | null;
    config?: Record<string, unknown> | null;
  };
}

interface AccountPoint {
  accountId: string;
  name: string;
  balance: number;
  pointsName: string;
  canRedeem: boolean;
}

const route = useRoute();
const accountStore = useAccountStore();
const rows = ref<ProductRow[]>([]);
const accounts = ref<AccountOverview[]>([]);
const loading = ref(false);
const error = ref('');
const statusFilter = ref('on_sale');
const typeFilter = ref<'all' | 'points' | 'points_cash'>('all');
const query = ref('');
const page = ref(1);
const pageSize = 24;
const failedImages = ref<Set<string>>(new Set());
const detailProduct = ref<ProductRow | null>(null);
const qrPreview = ref<{ name: string; url: string } | null>(null);

function hideImage(id: string) {
  failedImages.value.add(id);
  failedImages.value = new Set(failedImages.value);
}

const siteFilter = ref(typeof route.query.site === 'string' ? route.query.site : '');
const siteOptions = computed(() => {
  const map = new Map<string, { id: string; name: string }>();
  for (const row of rows.value) {
    if (row.site) map.set(row.site.id, { id: row.site.id, name: row.site.name });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
});

const accountPool = computed(() => {
  if (!accountStore.selectedId) return accounts.value;
  const selected = accounts.value.find((account) => account.id === accountStore.selectedId);
  return selected ? [selected] : accounts.value;
});

const visible = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  return rows.value.filter((row) => {
    if (siteFilter.value && row.site?.id !== siteFilter.value) return false;
    if (statusFilter.value === 'redeemable') {
      if (!rowCanRedeem(row)) return false;
    } else if (statusFilter.value !== 'all' && row.status !== statusFilter.value) {
      return false;
    }
    if (typeFilter.value === 'points' && Number(row.cashCost || 0) > 0) return false;
    if (typeFilter.value === 'points_cash' && Number(row.cashCost || 0) <= 0) return false;
    if (keyword && !`${row.name} ${row.externalId} ${row.site?.name ?? ''}`.toLowerCase().includes(keyword)) return false;
    return true;
  });
});

const pagedVisible = computed(() =>
  visible.value.slice((page.value - 1) * pageSize, page.value * pageSize),
);

watch([query, siteFilter, statusFilter, typeFilter], () => {
  page.value = 1;
});

watch(
  () => visible.value.length,
  (total) => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page.value > totalPages) page.value = totalPages;
  },
);

function rowCanRedeem(row: ProductRow) {
  if (row.status !== 'on_sale') return false;
  if (row.stock !== null && row.stock !== undefined && row.stock <= 0) return false;
  return accountPool.value.some((account) =>
    account.siteAccounts.some(
      (siteAccount) =>
        siteAccount.siteId === row.site?.id &&
        (siteAccount.pointAccount?.balance ?? 0) >= row.pointsCost,
    ),
  );
}

function productAccounts(row: ProductRow): AccountPoint[] {
  if (!row.site) return [];
  const points: AccountPoint[] = [];
  for (const account of accountPool.value) {
    for (const siteAccount of account.siteAccounts) {
      if (siteAccount.siteId !== row.site.id) continue;
      const balance = siteAccount.pointAccount?.balance ?? 0;
      points.push({
        accountId: account.id,
        name: account.displayName,
        balance,
        pointsName: row.site.pointsName,
        canRedeem:
          row.status === 'on_sale' &&
          (row.stock === null || row.stock === undefined || row.stock > 0) &&
          balance >= row.pointsCost,
      });
    }
  }
  return points.slice(0, 5);
}

function accountClass(point: AccountPoint) {
  return point.canRedeem
    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
}

function pointsSummary(row: ProductRow) {
  const cash = Number(row.cashCost || 0);
  if (cash > 0) return `${row.site?.pointsName ?? '积分'} ${row.pointsCost} + ¥${cash.toFixed(2)}`;
  return `${row.site?.pointsName ?? '积分'} ${row.pointsCost}`;
}

function qrUrl(row: ProductRow): string {
  const candidates = [
    row.raw?.qrCodeUrl,
    row.raw?.qrcode,
    row.raw?.qr_code,
    row.raw?.miniprogramCode,
    row.site?.metadata?.qrCodeUrl,
    row.site?.metadata?.qrcode,
    row.site?.config?.qrCodeUrl,
    row.site?.config?.qrcode,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return '';
}

function openQr(row: ProductRow) {
  const url = qrUrl(row);
  if (url) qrPreview.value = { name: row.name, url };
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [productList, accountList] = await Promise.all([
      api.get<ProductRow[]>('/products?kind=product'),
      api.get<AccountOverview[]>('/accounts/overview'),
    ]);
    rows.value = productList;
    accounts.value = accountList;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

function statusLabel(status: string) {
  if (status === 'on_sale') return '在售';
  if (status === 'sold_out') return '已售罄';
  if (status === 'off_shelf') return '已下架';
  return status;
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

onMounted(load);
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 class="text-lg font-semibold">商品 / 兑换</h2>
        <p class="text-sm text-slate-500">脚本同步的积分商品、积分+金额商品和库存；兑换在应用详情的兑换脚本里操作。</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <RouterLink to="/orders" class="btn-ghost !px-3 !py-1.5">兑换记录</RouterLink>
        <button class="btn-ghost !px-3 !py-1.5" :disabled="loading" @click="load">
          <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loading }" /> 刷新
        </button>
      </div>
    </div>

    <p v-if="error" class="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{{ error }}</p>

    <div class="card flex flex-wrap items-center gap-2">
      <div class="relative min-w-[12rem] flex-1">
        <Search class="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input v-model="query" class="input !pl-9" placeholder="搜索商品名称、ID、应用…" />
      </div>
      <select v-model="siteFilter" class="input !w-auto !py-1.5 text-xs">
        <option value="">全部应用</option>
        <option v-for="site in siteOptions" :key="site.id" :value="site.id">{{ site.name }}</option>
      </select>
      <select v-model="typeFilter" class="input !w-auto !py-1.5 text-xs">
        <option value="all">全部类型</option>
        <option value="points">仅积分</option>
        <option value="points_cash">积分 + 金额</option>
      </select>
      <select v-model="statusFilter" class="input !w-auto !py-1.5 text-xs">
        <option value="redeemable">可兑换</option>
        <option value="on_sale">在售</option>
        <option value="sold_out">已售罄</option>
        <option value="off_shelf">已下架</option>
        <option value="all">全部状态</option>
      </select>
      <span class="text-xs text-slate-500">{{ visible.length }} / {{ rows.length }}</span>
    </div>

    <div v-if="visible.length === 0" class="card flex flex-col items-center gap-3 py-10 text-center">
      <Package class="h-8 w-8 text-slate-400" />
      <div class="text-sm font-medium">没有匹配的商品</div>
      <p class="max-w-md text-sm text-slate-500">换个关键词或筛选条件，或在应用详情运行商品脚本同步。</p>
    </div>

    <template v-else>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="row in pagedVisible" :key="row.id" class="card flex flex-col gap-3">
        <div class="flex items-start gap-3">
          <div class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
            <img
              v-if="row.imageUrl && !failedImages.has(row.id)"
              :src="row.imageUrl"
              :alt="row.name"
              class="h-full w-full object-cover"
              @error="hideImage(row.id)"
            />
            <Package v-else class="h-6 w-6 text-slate-400" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="font-medium">{{ row.name }}</span>
              <span v-if="row.status !== 'on_sale'" class="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {{ statusLabel(row.status) }}
              </span>
              <span v-else-if="rowCanRedeem(row)" class="chip bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
                可兑换
              </span>
            </div>
            <div class="mt-1 text-xs text-slate-500">{{ row.site?.name ?? '应用' }} · {{ row.externalId }}</div>
            <div class="mt-1 text-xs font-medium text-brand-700 dark:text-brand-200">{{ pointsSummary(row) }}</div>
          </div>
        </div>

        <button
          v-if="row.description"
          type="button"
          class="line-clamp-2 whitespace-pre-line text-left text-xs text-slate-500 transition hover:text-brand-700 dark:hover:text-brand-200"
          title="点击查看完整详情"
          @click="detailProduct = row"
        >
          {{ row.description }}
        </button>

        <div class="rounded-xl border border-slate-200 p-2 dark:border-slate-800">
          <div class="mb-1.5 text-[11px] text-slate-500">
            <span>{{ accountStore.selectedId ? '当前账号积分' : '账号积分（最多 5 个）' }}</span>
          </div>
          <div v-if="productAccounts(row).length === 0" class="text-[11px] text-slate-400">该应用还没有绑定账号</div>
          <div v-else class="flex flex-wrap gap-1.5">
            <span
              v-for="point in productAccounts(row)"
              :key="point.accountId"
              class="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium"
              :class="accountClass(point)"
            >
              <span class="max-w-[5rem] truncate">{{ point.name }}</span>
              <span class="font-mono">{{ point.balance }}</span>
            </span>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
          <span>库存 <b class="font-medium text-slate-700 dark:text-slate-200">{{ row.stock ?? '—' }}</b></span>
          <span>限购 <b class="font-medium text-slate-700 dark:text-slate-200">{{ row.limitPerUser ?? '—' }}</b></span>
          <span class="min-w-0 truncate">同步 {{ formatDate(row.lastSeenAt) }}</span>
        </div>

        <div
          v-if="row.startAt || row.endAt || qrUrl(row)"
          class="mt-auto flex flex-wrap items-center justify-between gap-2"
        >
          <div v-if="row.startAt || row.endAt" class="text-[11px] text-slate-500">
            {{ formatDate(row.startAt) }} ~ {{ formatDate(row.endAt) }}
          </div>
          <span v-else />
          <button v-if="qrUrl(row)" class="btn-ghost !px-3 !py-1.5" @click="openQr(row)">
            <QrCode class="h-3.5 w-3.5" /> 小程序码
          </button>
        </div>
      </div>
    </div>
      <Pagination :page="page" :total="visible.length" :page-size="pageSize" unit="件商品" @update:page="page = $event" />
    </template>

    <div
      v-if="detailProduct"
      class="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4"
      @pointerdown.self="detailProduct = null"
    >
      <div class="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-2xl">
        <div class="flex items-start justify-between gap-2 border-b border-slate-100 p-4 dark:border-slate-800">
          <div class="min-w-0">
            <div class="text-sm font-semibold">商品详情</div>
            <div class="mt-1 truncate text-xs text-slate-500">{{ detailProduct.name }}</div>
          </div>
          <button class="btn-ghost !px-2 !py-1.5" @click="detailProduct = null">
            <X class="h-4 w-4" />
          </button>
        </div>

        <div class="flex-1 overflow-auto p-4">
          <p class="whitespace-pre-line text-sm leading-6 text-slate-600 dark:text-slate-300">
            {{ detailProduct.description }}
          </p>
        </div>

        <div class="flex justify-end border-t border-slate-100 p-4 dark:border-slate-800">
          <button class="btn-ghost" @click="detailProduct = null">关闭</button>
        </div>
      </div>
    </div>

    <div v-if="qrPreview" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" @pointerdown.self="qrPreview = null">
      <div class="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-900">
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="text-sm font-semibold">小程序码</div>
            <div class="truncate text-xs text-slate-500">{{ qrPreview.name }}</div>
          </div>
          <button class="btn-ghost !px-2 !py-1.5" @click="qrPreview = null">
            <X class="h-4 w-4" />
          </button>
        </div>
        <img :src="qrPreview.url" alt="小程序码" class="mx-auto mt-4 max-h-[60vh] w-full rounded-xl object-contain" />
      </div>
    </div>
  </div>
</template>
