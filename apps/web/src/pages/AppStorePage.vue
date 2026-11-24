<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  PackageOpen,
  Plus,
  RefreshCw,
  Search,
  Store,
  Trash2,
} from 'lucide-vue-next';
import {
  api,
  type AppSource,
  type SourceSyncResult,
  type StoreApp,
  type StoreInstallResult,
} from '../lib/api';
import { labelOf, trustLevelLabels } from '../lib/labels';
import { useToast } from '../lib/toast';
import Pagination from '../components/Pagination.vue';

const sources = ref<AppSource[]>([]);
const apps = ref<StoreApp[]>([]);
const loading = ref(true);
const error = ref('');
const message = ref('');
const search = ref('');
const sourceFilter = ref('');
const installedFilter = ref<'all' | 'installed' | 'available'>('all');
const bindAll = ref(false);
const enableScripts = ref(false);
const busy = ref<Record<string, string>>({});
const page = ref(1);
const pageSize = 12;
const showSourceForm = ref(false);
const lastSite = ref<{ id: string; name: string } | null>(null);
const toast = useToast();

const sourceForm = reactive({
  name: '',
  indexUrl: 'local://app-store/index.json',
  repoUrl: 'local://app-store',
  trustLevel: 'official',
});

watch(error, (value) => {
  if (!value) return;
  toast.error(value);
  error.value = '';
});

watch(message, (value) => {
  if (!value) return;
  const site = lastSite.value;
  if (site) {
    toast.success(value, { to: `/sites/${site.id}`, text: `打开 ${site.name}` });
    lastSite.value = null;
  } else {
    toast.success(value);
  }
  message.value = '';
});

const appCounts = computed(() => ({
  total: apps.value.length,
  installed: apps.value.filter((item) => item.installed).length,
  available: apps.value.filter((item) => !item.installed).length,
}));

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return apps.value.filter((item) => {
    if (sourceFilter.value && item.source.id !== sourceFilter.value) return false;
    if (installedFilter.value === 'installed' && !item.installed) return false;
    if (installedFilter.value === 'available' && item.installed) return false;
    if (!q) return true;
    return [item.name, item.key, item.appId, item.description, item.pointsName, item.source.name]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q));
  });
});

const pagedApps = computed(() =>
  filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize),
);

watch([search, sourceFilter, installedFilter], () => {
  page.value = 1;
});

watch(
  () => filtered.value.length,
  (total) => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page.value > totalPages) page.value = totalPages;
  },
);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [sourceList, appList] = await Promise.all([
      api.get<AppSource[]>('/app-store/sources'),
      api.get<StoreApp[]>('/app-store/apps'),
    ]);
    sources.value = sourceList;
    apps.value = appList;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

function addLocalSource() {
  sourceForm.name = '本地应用目录';
  sourceForm.indexUrl = 'local://app-store/index.json';
  sourceForm.repoUrl = 'local://app-store';
  sourceForm.trustLevel = 'official';
  showSourceForm.value = true;
}

async function createSource() {
  error.value = '';
  message.value = '';
  const existing = sources.value.find(
    (source) => source.indexUrl === sourceForm.indexUrl.trim(),
  );
  if (existing) {
    showSourceForm.value = false;
    error.value = `应用源「${existing.name}」已存在`;
    return;
  }
  busy.value = { ...busy.value, source: 'create' };
  try {
    await api.post<AppSource>('/app-store/sources', {
      ...sourceForm,
      repoUrl: sourceForm.repoUrl || sourceForm.indexUrl,
    });
    showSourceForm.value = false;
    message.value = '应用源已添加，正在同步应用列表…';
    await load();
    const created = sources.value[sources.value.length - 1];
    if (created) await syncSource(created);
  } catch (e) {
    error.value = e instanceof Error ? e.message : '添加应用源失败';
  } finally {
    busy.value = { ...busy.value, source: '' };
  }
}

async function syncSource(source: AppSource) {
  error.value = '';
  message.value = '';
  busy.value = { ...busy.value, [source.id]: 'sync' };
  try {
    const result = await api.post<SourceSyncResult>(
      `/app-store/sources/${source.id}/sync`,
    );
    message.value = `「${source.name}」已同步：${result.apps} 个应用、${result.scripts ?? result.synced} 个脚本`;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '同步失败';
  } finally {
    busy.value = { ...busy.value, [source.id]: '' };
  }
}

async function removeSource(source: AppSource) {
  if (!window.confirm(`取消订阅「${source.name}」？已下载的应用不会被删除。`)) return;
  error.value = '';
  message.value = '';
  busy.value = { ...busy.value, [source.id]: 'remove' };
  try {
    await api.del(`/app-store/sources/${source.id}`);
    message.value = `已取消订阅「${source.name}」`;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '取消订阅失败';
  } finally {
    busy.value = { ...busy.value, [source.id]: '' };
  }
}

async function installApp(app: StoreApp, update = false) {
  error.value = '';
  message.value = '';
  lastSite.value = null;
  busy.value = { ...busy.value, [app.id]: update ? 'update' : 'install' };
  try {
    const result = await api.post<StoreInstallResult>(
      `/app-store/apps/${app.id}/${update ? 'update' : 'install'}`,
      { bindAll: bindAll.value, enableScripts: enableScripts.value },
    );
    lastSite.value = { id: result.site.id, name: result.site.name };
    message.value = update
      ? `「${app.name}」已更新：${result.files.length} 个文件`
      : `「${app.name}」已下载：${result.scripts} 个脚本${result.bound ? `，绑定 ${result.bound} 个账号` : ''}${enableScripts.value ? '，脚本已启用' : ''}`;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '下载失败';
  } finally {
    busy.value = { ...busy.value, [app.id]: '' };
  }
}

function sourceApps(source: AppSource) {
  return source._count?.apps ?? apps.value.filter((item) => item.source.id === source.id).length;
}

onMounted(load);
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold">应用商店</h2>
        <p class="text-sm text-slate-500">
          订阅多个应用源，搜索并下载应用脚本；下载后到应用详情配置环境变量、启用和测试。
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button class="btn-ghost !px-3 !py-1.5" @click="addLocalSource">
          <PackageOpen class="h-4 w-4" /> 本地目录
        </button>
        <button class="btn-primary" @click="showSourceForm = !showSourceForm">
          <Plus class="h-4 w-4" /> 添加应用源
        </button>
      </div>
    </div>

    <form v-if="showSourceForm" class="card space-y-3" @submit.prevent="createSource">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-sm font-semibold">添加应用源</h3>
        <span class="text-xs text-slate-500">支持 http(s) 和本机 local://</span>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label class="label">名称</label>
          <input v-model="sourceForm.name" class="input" placeholder="社区应用源" />
        </div>
        <div>
          <label class="label">信任级别</label>
          <select v-model="sourceForm.trustLevel" class="input">
            <option value="official">官方</option>
            <option value="community">社区</option>
            <option value="custom">自定义（强警告）</option>
          </select>
        </div>
        <div class="sm:col-span-2">
          <label class="label">应用源 index.json</label>
          <input v-model="sourceForm.indexUrl" class="input font-mono text-xs" placeholder="https://.../index.json 或 local://app-store/index.json" />
        </div>
        <div class="sm:col-span-2">
          <label class="label">仓库地址（可选）</label>
          <input v-model="sourceForm.repoUrl" class="input font-mono text-xs" placeholder="https://github.com/..." />
        </div>
      </div>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn-ghost" @click="showSourceForm = false">取消</button>
        <button class="btn-primary" type="submit" :disabled="busy.source === 'create'">
          {{ busy.source === 'create' ? '添加并同步…' : '添加' }}
        </button>
      </div>
    </form>

    <div class="card space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <Store class="h-4 w-4 text-slate-500" />
          <h3 class="text-sm font-semibold">已订阅应用源</h3>
          <span class="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{{ sources.length }}</span>
        </div>
        <div class="text-xs text-slate-500">
          共 {{ appCounts.total }} 个应用 · 已下载 {{ appCounts.installed }} · 可下载 {{ appCounts.available }}
        </div>
      </div>
      <div v-if="sources.length === 0" class="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">
        <template v-if="loading">正在加载应用源…</template>
        <template v-else>还没有应用源。可以添加远程 index.json，或点“本地目录”订阅仓库里的 data/apps。</template>
      </div>
      <div v-else class="grid gap-2 sm:grid-cols-2">
        <div
          v-for="source in sources"
          :key="source.id"
          class="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-medium">{{ source.name }}</span>
                <span class="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {{ labelOf(trustLevelLabels, source.trustLevel) }}
                </span>
              </div>
              <div class="mt-1 break-all font-mono text-[11px] text-slate-500">{{ source.indexUrl }}</div>
              <div class="mt-1 text-xs text-slate-500">
                {{ sourceApps(source) }} 个应用
                <span v-if="source.lastSyncedAt"> · 上次同步 {{ new Date(source.lastSyncedAt).toLocaleString('zh-CN', { hour12: false }) }}</span>
              </div>
              <div v-if="source.lastError" class="mt-1 text-xs text-red-600 dark:text-red-300">{{ source.lastError }}</div>
            </div>
            <button class="btn-ghost shrink-0 !px-3 !py-1.5" :disabled="Boolean(busy[source.id])" @click="syncSource(source)">
              <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': busy[source.id] === 'sync' }" />
            </button>
            <button class="btn-ghost shrink-0 !px-2.5 !py-1.5 text-red-600 dark:text-red-300" title="取消订阅" :disabled="Boolean(busy[source.id])" @click="removeSource(source)">
              <Trash2 class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="card space-y-3">
      <div class="flex flex-wrap items-center gap-2">
        <div class="relative min-w-[12rem] flex-1">
          <Search class="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input v-model="search" class="input !pl-9" placeholder="搜索应用名称、key、AppID、积分别名…" />
        </div>
        <select v-model="sourceFilter" class="input !w-auto !py-1.5 text-xs">
          <option value="">全部应用源</option>
          <option v-for="source in sources" :key="source.id" :value="source.id">{{ source.name }}</option>
        </select>
        <select v-model="installedFilter" class="input !w-auto !py-1.5 text-xs">
          <option value="all">全部状态</option>
          <option value="installed">已下载</option>
          <option value="available">未下载</option>
        </select>
        <label class="flex items-center gap-1.5 text-xs text-slate-500">
          <input v-model="bindAll" type="checkbox" class="h-3.5 w-3.5" />
          下载后绑定所有账号
        </label>
        <label class="flex items-center gap-1.5 text-xs text-slate-500">
          <input v-model="enableScripts" type="checkbox" class="h-3.5 w-3.5" />
          下载后启用脚本
        </label>
        <button class="btn-ghost !px-3 !py-1.5" :disabled="loading" @click="load">
          <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loading }" /> 刷新
        </button>
      </div>

      <div v-if="loading && apps.length === 0" class="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
        正在加载应用…
      </div>
      <div v-else-if="filtered.length === 0" class="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
        没有匹配的应用。可以换关键词，或先同步应用源。
      </div>
      <template v-else>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <article
          v-for="app in pagedApps"
          :key="app.id"
          class="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
        >
          <div class="flex items-start gap-3">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 text-lg font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
              <img v-if="app.iconUrl" :src="app.iconUrl" alt="" class="h-full w-full object-cover" />
              <span v-else>{{ app.name.slice(0, 1) }}</span>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="truncate text-sm font-semibold">{{ app.name }}</h3>
                <span
                  v-if="app.installed"
                  class="chip bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                >
                  <CheckCircle2 class="mr-1 h-3 w-3" /> 已下载
                </span>
                <span v-else class="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">未下载</span>
              </div>
              <div class="mt-1 text-xs text-slate-500">
                {{ app.source.name }}
                <span v-if="app.category"> · {{ app.category }}</span>
                <span v-if="app.version"> · {{ app.version }}</span>
              </div>
            </div>
          </div>

          <p class="mt-3 line-clamp-2 min-h-[2.5rem] text-sm text-slate-600 dark:text-slate-300">
            {{ app.description || '暂无简介' }}
          </p>

          <div class="mt-3 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
            <span class="chip bg-slate-100 dark:bg-slate-800">{{ app.scriptCount }} 个脚本</span>
            <span class="chip bg-slate-100 dark:bg-slate-800">{{ app.pointsName }}</span>
            <span class="chip bg-slate-100 font-mono dark:bg-slate-800">{{ app.appId }}</span>
          </div>

          <div class="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
            <div class="text-[11px] text-slate-400">key: {{ app.key }}</div>
            <div class="flex gap-2">
              <RouterLink v-if="app.installed && app.site" :to="`/sites/${app.site.id}`" class="btn-ghost !px-3 !py-1.5">
                <ExternalLink class="h-3.5 w-3.5" /> 打开
              </RouterLink>
              <button
                v-if="app.installed"
                class="btn-ghost !px-3 !py-1.5"
                :disabled="Boolean(busy[app.id])"
                @click="installApp(app, true)"
              >
                <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': busy[app.id] === 'update' }" />
                {{ busy[app.id] === 'update' ? '更新中…' : app.updateAvailable ? '有更新' : '更新脚本' }}
              </button>
              <button
                v-else
                class="btn-primary !px-3 !py-1.5"
                :disabled="Boolean(busy[app.id])"
                @click="installApp(app)"
              >
                <Download class="h-3.5 w-3.5" />
                {{ busy[app.id] === 'install' ? '下载中…' : '下载' }}
              </button>
            </div>
          </div>
        </article>
      </div>
      <Pagination :page="page" :total="filtered.length" :page-size="pageSize" unit="个应用" @update:page="page = $event" />
      </template>
    </div>
  </div>
</template>
