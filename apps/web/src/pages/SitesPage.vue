<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ArrowUpRight, FileCode2, Globe2, Plus, Users } from 'lucide-vue-next';
import { api, type Site } from '../lib/api';
import { siteIconSrc } from '../lib/site-icon';
import {
  labelOf,
  networkModeLabels,
  registrationModeClass,
  registrationModeLabels,
  siteStatusLabels,
} from '../lib/labels';
import { useAccountStore } from '../stores/account';
import AccountTransferModal from '../components/AccountTransferModal.vue';
import Pagination from '../components/Pagination.vue';

const accountStore = useAccountStore();
const sites = ref<Site[]>([]);
const error = ref('');
const message = ref('');
const accountEditorSite = ref<Site | null>(null);
const loading = ref(false);
const showForm = ref(false);
const query = ref('');
const sourceFilter = ref('');
const page = ref(1);
const pageSize = 12;
const form = ref({ key: '', name: '', appId: '', pointsName: '积分' });

const sourceOptions = computed(() => {
  const map = new Map<string, string>();
  for (const site of sites.value) {
    if (site.source) map.set(site.source.id, site.source.name);
  }
  return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
});

const visibleSites = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  return sites.value.filter((site) => {
    if (sourceFilter.value && site.source?.id !== sourceFilter.value) return false;
    if (!keyword) return true;
    return [site.name, site.key, site.appId, site.pointsName]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword));
  });
});

const pagedSites = computed(() =>
  visibleSites.value.slice((page.value - 1) * pageSize, page.value * pageSize),
);

watch([query, sourceFilter], () => {
  page.value = 1;
});

watch(
  () => visibleSites.value.length,
  (total) => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page.value > totalPages) page.value = totalPages;
  },
);

function statusDotClass(status: string) {
  if (status === 'active') return 'bg-emerald-500';
  if (status === 'broken') return 'bg-red-500';
  return 'bg-slate-400';
}

function domainLabel(site: Site) {
  const origins = (site.allowedOrigins || []).map((origin) => origin.replace(/^https?:\/\//i, ''));
  if (origins.length === 0) return '未配置域名';
  return origins.length === 1 ? origins[0] : `${origins[0]} +${origins.length - 1}`;
}

function siteAccounts(siteId: string) {
  return accountStore.allSiteAccounts.filter((account) => account.siteId === siteId);
}

function accountCount(site: Site) {
  return siteAccounts(site.id).length || site._count?.siteAccounts || 0;
}

function openAccountEditor(site: Site) {
  accountEditorSite.value = site;
}

async function accountSaved() {
  message.value = '应用账号已更新';
  await load();
}

async function load() {
  loading.value = true;
  try {
    sites.value = await api.get<Site[]>('/sites');
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

async function create() {
  error.value = '';
  try {
    await api.post('/sites', {
      key: form.value.key,
      name: form.value.name,
      appId: form.value.appId,
      pointsName: form.value.pointsName.trim() || '积分',
    });
    form.value = { key: '', name: '', appId: '', pointsName: '积分' };
    showForm.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '创建失败';
  }
}

onMounted(() => {
  void accountStore.load();
  void load();
});
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 class="text-lg font-semibold">应用</h2>
        <p class="text-sm text-slate-500">一个应用对应一个小程序；功能脚本挂在应用下。</p>
      </div>
      <button class="btn-primary" @click="showForm = !showForm">
        <Plus class="h-4 w-4" />
        添加应用
      </button>
    </div>

    <p v-if="error" class="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{{ error }}</p>
    <p v-if="message" class="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">{{ message }}</p>

    <div v-if="sites.length > 0" class="flex flex-wrap items-center gap-2">
      <input v-model="query" class="input max-w-xs" placeholder="搜索名称、key、AppID、积分名称" />
      <select v-model="sourceFilter" class="input !w-auto !py-1.5 text-xs">
        <option value="">全部应用源</option>
        <option v-for="source in sourceOptions" :key="source.id" :value="source.id">{{ source.name }}</option>
      </select>
      <span class="text-xs text-slate-500">共 {{ sites.length }} 个应用，显示 {{ visibleSites.length }} 个</span>
    </div>

    <form v-if="showForm" class="card grid gap-3 sm:grid-cols-2" @submit.prevent="create">
      <div>
        <label class="label">应用 key</label>
        <input v-model="form.key" class="input" placeholder="demo" />
      </div>
      <div>
        <label class="label">名称</label>
        <input v-model="form.name" class="input" placeholder="示例应用" />
      </div>
      <div>
        <label class="label">AppID</label>
        <input v-model="form.appId" class="input" placeholder="wx..." />
      </div>
      <div>
        <label class="label">积分别名</label>
        <input v-model="form.pointsName" class="input" placeholder="积分" />
        <p class="mt-1 text-xs text-slate-500">各应用可自定义，例如“金币”“成长值”。</p>
      </div>
      <div class="sm:col-span-2 flex justify-end">
        <button class="btn-primary" type="submit">创建</button>
      </div>
    </form>

    <div v-if="visibleSites.length === 0" class="card flex flex-col items-center gap-3 py-10 text-center">
      <Globe2 class="h-8 w-8 text-slate-400" />
      <div class="text-sm font-medium">没有匹配的应用</div>
      <p class="max-w-md text-sm text-slate-500">{{ sites.length ? '换个关键词试试。' : '先创建一个应用，再在应用详情里添加脚本文件和脚本条目。' }}</p>
    </div>

    <template v-else>
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="site in pagedSites"
        :key="site.id"
        class="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition duration-200 hover:border-brand-300 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-700"
      >
        <div class="flex items-start gap-3">
          <div class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 text-lg font-semibold text-brand-700 ring-1 ring-brand-100 dark:from-brand-900/40 dark:to-brand-800/30 dark:text-brand-100 dark:ring-brand-800">
            <img v-if="siteIconSrc(site)" :src="siteIconSrc(site)" :alt="site.name" class="h-full w-full object-cover" />
            <span v-else>{{ site.name.slice(0, 1) }}</span>
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="truncate text-base font-semibold">{{ site.name }}</div>
                <div class="mt-0.5 truncate text-xs text-slate-500">
                  {{ site.key }} · {{ site.appId }}
                </div>
              </div>
              <span class="inline-flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
                <span class="h-1.5 w-1.5 rounded-full" :class="statusDotClass(site.status)" />
                {{ labelOf(siteStatusLabels, site.status) }}
              </span>
            </div>

            <div class="mt-2 flex flex-wrap items-center gap-1.5">
              <span class="chip bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-100">
                {{ site.pointsName }}
              </span>
              <span v-if="site.source" class="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {{ site.source.name }}
              </span>
              <span class="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {{ labelOf(networkModeLabels, site.networkMode) }}
              </span>
              <span
                v-if="site.registrationMode && site.registrationMode !== 'unknown'"
                class="chip"
                :class="registrationModeClass(site.registrationMode)"
                :title="site.registrationNote || undefined"
              >
                {{ labelOf(registrationModeLabels, site.registrationMode) }}
              </span>
            </div>
          </div>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-2">
          <RouterLink
            :to="{ path: `/sites/${site.id}`, hash: '#site-scripts' }"
            class="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 transition hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800"
            title="查看应用脚本"
          >
            <FileCode2 class="h-4 w-4 text-slate-400" />
            <div>
              <div class="text-sm font-semibold leading-none">{{ site.scripts?.length ?? 0 }}</div>
              <div class="mt-1 text-[11px] leading-none text-slate-500">脚本 · 点击查看</div>
            </div>
          </RouterLink>
          <button
            class="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-left transition hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800"
            type="button"
            title="编辑应用账号"
            @click="openAccountEditor(site)"
          >
            <Users class="h-4 w-4 text-slate-400" />
            <div>
              <div class="text-sm font-semibold leading-none">{{ accountCount(site) }}</div>
              <div class="mt-1 text-[11px] leading-none text-slate-500">账号 · 穿梭选择</div>
            </div>
          </button>
        </div>

        <div class="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800">
          <span class="truncate">{{ domainLabel(site) }}</span>
          <RouterLink
            :to="`/sites/${site.id}`"
            class="inline-flex shrink-0 items-center gap-0.5 rounded-lg px-1 py-1 font-medium text-brand-600 transition hover:gap-1.5 dark:text-brand-300"
          >
            管理 <ArrowUpRight class="h-3.5 w-3.5" />
          </RouterLink>
        </div>
      </div>
    </div>
    <Pagination :page="page" :total="visibleSites.length" :page-size="pageSize" unit="个应用" @update:page="page = $event" />
    </template>

    <AccountTransferModal
      :open="Boolean(accountEditorSite)"
      :site="accountEditorSite"
      @close="accountEditorSite = null"
      @saved="accountSaved"
    />
  </div>
</template>
