<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { BookOpen, PlayCircle, Search, X } from 'lucide-vue-next';
import { ApiError, api, type ActionFormField, type Run } from '../lib/api';
import { labelOf, queueTicketText, runStatusLabels } from '../lib/labels';
import { useEscapeClose } from '../lib/modal-escape';
import { runActionDetails } from '../lib/run-actions';
import { useAccountStore } from '../stores/account';
import { runEventsConnected, subscribeRunEvents, type RunLogEvent } from '../stores/runEvents';
import RunDetailPanel from '../components/RunDetailPanel.vue';
import ActionFormModal from '../components/ActionFormModal.vue';
import Pagination from '../components/Pagination.vue';

const route = useRoute();
const router = useRouter();
const accountStore = useAccountStore();
const runs = ref<Run[]>([]);
const selected = ref<Run | null>(null);
const selectedLoading = ref(false);
const retrying = ref(false);
const actioning = ref(false);
const actionModalOpen = ref(false);
const actionModalRun = ref<Run | null>(null);
const actionModalFields = ref<ActionFormField[]>([]);
const error = ref('');
const notice = ref('');
const siteQuery = ref('');
const page = ref(1);
const pageSize = 20;
const modalOpen = ref(false);
useEscapeClose(() => { modalOpen.value = false; }, () => modalOpen.value);
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let detailTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribeEvents: (() => void) | null = null;

const visibleRuns = computed(() =>
  runs.value.filter((run) => {
    const query = siteQuery.value.trim().toLowerCase();
    if (query) {
      const site = run.site ?? run.task?.binding?.site;
      if (!site) return false;
      const values = [site.name, site.key, site.appId].filter(Boolean);
      if (!values.some((value) => String(value).toLowerCase().includes(query))) return false;
    }
    if (!accountStore.selectedId) return true;
    const id =
      run.siteAccount?.wechatAccount?.id ??
      run.task?.binding?.siteAccount?.wechatAccount?.id;
    return id === accountStore.selectedId;
  }),
);

const pagedRuns = computed(() =>
  visibleRuns.value.slice((page.value - 1) * pageSize, page.value * pageSize),
);

watch([siteQuery, () => accountStore.selectedId], () => {
  page.value = 1;
  if (selected.value && !visibleRuns.value.some((run) => run.id === selected.value?.id)) {
    selected.value = null;
    modalOpen.value = false;
  }
});

watch(
  () => visibleRuns.value.length,
  (total) => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page.value > totalPages) page.value = totalPages;
  },
);

const runningCount = computed(
  () => runs.value.filter((run) => run.status === 'running' || run.status === 'starting').length,
);
const queuedCount = computed(() => runs.value.filter((run) => run.status === 'queued').length);

function accountName(run: Run) {
  return (
    run.siteAccount?.wechatAccount?.displayName ??
    run.task?.binding?.siteAccount?.wechatAccount?.displayName ??
    '未知账号'
  );
}

function mergeRun(incoming: Run) {
  const index = runs.value.findIndex((run) => run.id === incoming.id);
  if (index >= 0) {
    runs.value[index] = { ...runs.value[index], ...incoming };
  } else {
    runs.value.unshift(incoming);
  }
  const current = selected.value;
  if (current && current.id === incoming.id) {
    selected.value = { ...current, ...incoming, logs: current.logs ?? [] };
  }
}

function appendLog(log: RunLogEvent) {
  const current = selected.value;
  if (!current || current.id !== log.runId) return;
  const logs = current.logs ?? [];
  if (logs.some((item) => item.id === log.id)) return;
  current.logs = [...logs, log];
}

function isActiveStatus(status?: string) {
  return status === 'queued' || status === 'starting' || status === 'running';
}

/**
 * SSE 推送在“刚重跑、详情还没选中”的瞬间可能丢事件，导致详情停在启动中。
 * 对当前选中的活动运行做 1 秒一次的后备刷新，直到进入终态。
 */
function scheduleDetailPoll() {
  if (detailTimer) {
    clearTimeout(detailTimer);
    detailTimer = null;
  }
  const current = selected.value;
  if (!current || !isActiveStatus(current.status)) return;
  const runId = current.id;
  detailTimer = setTimeout(async () => {
    detailTimer = null;
    if (!selected.value || selected.value.id !== runId) return;
    await select(selected.value, false, true);
  }, 1000);
}

async function load() {
  try {
    runs.value = await api.get<Run[]>('/runs');
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  } finally {
    schedulePoll();
  }
}

function schedulePoll() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  pollTimer = setTimeout(async () => {
    await load();
    // SSE 已连接时详情和日志由推送更新，避免每 5 秒重新请求导致面板闪动。
    if (selected.value && !runEventsConnected.value) {
      await select(selected.value, false, true);
    }
  }, runEventsConnected.value ? 15000 : 1500);
}

async function select(run: Run, openModal = true, silent = false) {
  if (!silent) selectedLoading.value = true;
  if (openModal) modalOpen.value = true;
  try {
    const fresh = await api.get<Run>(`/runs/${run.id}`);
    const previous = selected.value && selected.value.id === fresh.id ? selected.value : null;
    const fetchedLogs = fresh.logs ?? [];
    const known = new Set(fetchedLogs.map((log) => log.id));
    const extra = (previous?.logs ?? []).filter((log) => !known.has(log.id));
    if (extra.length) {
      fresh.logs = [...fetchedLogs, ...extra].sort((a, b) => a.ts.localeCompare(b.ts));
    }
    selected.value = fresh;
    // 详情轮询同时把状态同步回列表，避免详情已成功、列表还停在运行中。
    const index = runs.value.findIndex((item) => item.id === fresh.id);
    if (index >= 0) {
      runs.value[index] = { ...runs.value[index], ...fresh, logs: undefined };
    }
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.code === 'run_not_found')) {
      runs.value = runs.value.filter((item) => item.id !== run.id);
      if (!selected.value || selected.value.id === run.id) {
        selected.value = null;
        modalOpen.value = false;
      }
      if (route.query.run === run.id) {
        void router.replace({ path: '/runs', query: {} });
      }
      return;
    }
    error.value = e instanceof Error ? e.message : '加载失败';
  } finally {
    if (!silent) selectedLoading.value = false;
    scheduleDetailPoll();
  }
}

async function retry(run: Run) {
  retrying.value = true;
  try {
    const created = await api.post<Run>(`/runs/${run.id}/retry`);
    notice.value = queueTicketText(created.queue);
    await load();
    await select(created, false);
  } catch (e) {
    error.value = e instanceof Error ? e.message : '重跑失败';
  } finally {
    retrying.value = false;
  }
}

async function runAction(run: Run, action: string) {
  const details = runActionDetails(run);
  if (action === 'register' && details.fields.length > 0) {
    actionModalRun.value = run;
    actionModalFields.value = details.fields;
    actionModalOpen.value = true;
    return;
  }
  await submitAction(run, action);
}

async function submitAction(run: Run, action: string, input?: Record<string, string>) {
  actioning.value = true;
  error.value = '';
  try {
    const body = input && Object.keys(input).length > 0 ? { action, input } : { action };
    const created = await api.post<Run>(`/runs/${run.id}/action`, body);
    notice.value = queueTicketText(created.queue);
    await load();
    await select(created, false);
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败';
  } finally {
    actioning.value = false;
  }
}

async function submitRegistration(values: Record<string, string>) {
  const run = actionModalRun.value;
  if (!run) return;
  await submitAction(run, 'register', values);
  actionModalOpen.value = false;
  actionModalRun.value = null;
  actionModalFields.value = [];
}

function statusClass(status: string) {
  if (status === 'succeeded') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200';
  if (status === 'failed' || status === 'timeout') return 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200';
  if (status === 'running' || status === 'starting' || status === 'queued') return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200';
  if (status === 'skipped') return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

function formatTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

onMounted(async () => {
  unsubscribeEvents = subscribeRunEvents((event) => {
    if (event.type === 'run') {
      mergeRun(event.data);
      if (selected.value?.id === event.data.id) scheduleDetailPoll();
    } else if (event.type === 'log') {
      appendLog(event.data);
    } else if (event.type === 'sync') {
      // SSE（重）连接后补一次全量刷新，避免断线期间的状态和日志缺口。
      void load();
      if (selected.value) void select(selected.value, false, true);
    }
  });
  await load();
  const runId = typeof route.query.run === 'string' ? route.query.run : '';
  if (runId) await select({ id: runId } as Run, window.innerWidth < 1024);
});

watch(
  () => route.query.run,
  (runId) => {
    if (typeof runId === 'string' && runId) {
      void select({ id: runId } as Run, window.innerWidth < 1024);
    }
  },
);
onUnmounted(() => {
  if (pollTimer) clearTimeout(pollTimer);
  if (detailTimer) clearTimeout(detailTimer);
  unsubscribeEvents?.();
  unsubscribeEvents = null;
});
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 class="text-lg font-semibold">运行</h2>
        <p class="text-sm text-slate-500">运行记录、错误码和日志；这里显示最近 50 条，完整历史请用「全部日志」搜索。</p>
        <p v-if="accountStore.selectedAccount" class="mt-1 text-xs text-brand-600 dark:text-brand-300">
          当前账号：{{ accountStore.selectedAccount.displayName }}
        </p>
        <p v-else class="mt-1 text-xs text-slate-500">当前显示全部账号，可在右上角切换。</p>
      </div>
      <div class="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <div class="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
          <Search class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            v-model="siteQuery"
            type="text"
            class="input !py-1.5 !pl-8 !pr-8 text-xs"
            placeholder="搜索应用名称或 AppID"
          />
          <button
            v-if="siteQuery"
            type="button"
            class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
            title="清空筛选"
            @click="siteQuery = ''"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </div>
        <button class="btn-ghost shrink-0" @click="load">刷新</button>
        <RouterLink to="/logs" class="btn-ghost shrink-0">全部日志</RouterLink>
      </div>
    </div>

    <p v-if="error" class="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{{ error }}</p>
    <p v-if="notice" class="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">{{ notice }}</p>

    <div
      v-if="runningCount > 0 || queuedCount > 0"
      class="card flex flex-wrap items-center justify-between gap-3 border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/20"
    >
      <div class="flex flex-wrap items-center gap-3 text-sm">
        <span class="chip bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200">运行队列</span>
        <span>启动/运行中 <b>{{ runningCount }}</b></span>
        <span>排队中 <b>{{ queuedCount }}</b></span>
        <span class="text-xs text-slate-500">{{ runEventsConnected ? 'SSE 实时刷新' : '轮询刷新（SSE 重连中）' }}</span>
      </div>
      <button class="btn-ghost !px-3 !py-1.5" @click="load">刷新</button>
    </div>

    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="text-sm font-semibold">脚本 SDK 文档</div>
        <p class="mt-1 text-xs text-slate-500">日志详情、错误 details、ctx.input、活动表单等接入说明。</p>
      </div>
      <RouterLink to="/sdk#errors" class="btn-ghost !px-3 !py-1.5">
        <BookOpen class="h-4 w-4" /> 查看 SDK 文档
      </RouterLink>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <div class="card">
        <div v-if="visibleRuns.length === 0" class="flex flex-col items-center gap-3 py-10 text-center">
          <PlayCircle class="h-8 w-8 text-slate-400" />
          <div class="text-sm font-medium">
            {{ siteQuery.trim() ? '没有匹配的运行记录' : accountStore.selectedId ? '当前账号没有运行记录' : '还没有运行' }}
          </div>
          <p v-if="siteQuery.trim()" class="text-sm text-slate-500">
            没有找到名称或 AppID 包含“{{ siteQuery.trim() }}”的运行记录，换个关键词试试。
          </p>
          <p v-else class="text-sm text-slate-500">在应用详情运行脚本后，记录会出现在这里。</p>
          <button v-if="siteQuery.trim()" class="btn-ghost !px-3 !py-1.5" @click="siteQuery = ''">清空筛选</button>
        </div>
        <div v-else class="space-y-2">
          <button
            v-for="run in pagedRuns"
            :key="run.id"
            class="w-full rounded-xl border px-3 py-2 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800"
            :class="selected?.id === run.id ? 'border-brand-500' : 'border-slate-200 dark:border-slate-800'"
            @click="select(run)"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <div class="truncate">
                  <span class="font-medium">{{ accountName(run) }}</span>
                  · {{ run.site?.name ?? run.task?.binding?.site?.name ?? '应用' }}
                  · {{ run.siteScript?.name ?? run.task?.capability ?? '任务' }}
                </div>
                <div class="text-xs text-slate-500">{{ formatTime(run.createdAt) }}</div>
              </div>
              <span class="chip" :class="statusClass(run.status)">{{ labelOf(runStatusLabels, run.status) }}</span>
            </div>
          </button>
        </div>
        <Pagination :page="page" :total="visibleRuns.length" :page-size="pageSize" unit="条运行" @update:page="page = $event" />
      </div>

      <div class="card hidden self-start lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
        <RunDetailPanel
          :run="selected"
          :loading="selectedLoading"
          :retrying="retrying"
          :actioning="actioning"
          @retry="retry"
          @action="runAction"
        />
      </div>
    </div>

    <div v-if="modalOpen" class="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 lg:hidden" @pointerdown.self="modalOpen = false">
      <div class="flex max-h-[90vh] w-full flex-col rounded-t-2xl bg-white p-4 shadow-2xl dark:bg-slate-900">
        <div class="mb-2 flex items-center justify-between">
          <div class="text-sm font-semibold">运行日志</div>
          <button class="btn-ghost !px-2 !py-1.5" @click="modalOpen = false">
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="overflow-auto">
          <RunDetailPanel
            :run="selected"
            :loading="selectedLoading"
            :retrying="retrying"
            :actioning="actioning"
            @retry="retry"
            @action="runAction"
          />
        </div>
      </div>
    </div>

    <ActionFormModal
      :open="actionModalOpen"
      title="注册账号"
      :fields="actionModalFields"
      :submitting="actioning"
      @close="actionModalOpen = false"
      @submit="submitRegistration"
    />
  </div>
</template>
