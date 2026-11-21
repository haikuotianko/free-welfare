<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { RotateCcw, UserPlus } from 'lucide-vue-next';
import type { Run } from '../lib/api';
import { labelOf, runStatusLabels } from '../lib/labels';

const props = defineProps<{ run: Run | null; loading?: boolean; retrying?: boolean; actioning?: boolean }>();
const emit = defineEmits<{ retry: [run: Run]; action: [run: Run, action: string] }>();
const logBox = ref<HTMLElement | null>(null);

const emptyLogText = computed(() => {
  const status = props.run?.status;
  if (status === 'queued') return '排队中，轮到后会开始输出日志…';
  if (status === 'starting') return '正在启动，脚本开始后输出日志…';
  if (status === 'running') return '脚本运行中，等待输出…';
  return '暂无日志';
});

watch(
  () => props.run?.logs?.length,
  async () => {
    await nextTick();
    if (logBox.value) logBox.value.scrollTop = logBox.value.scrollHeight;
  },
);

function manualAction(run: Run) {
  const summary = run.summary as { details?: { action?: unknown } } | null | undefined;
  const action = summary?.details?.action;
  return typeof action === 'string' ? action : '';
}

function formatTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function hasDetails(value: unknown) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

function pretty(value: unknown) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
</script>

<template>
  <div v-if="loading" class="py-10 text-center text-sm text-slate-500">加载中…</div>
  <div v-else-if="!run" class="flex flex-col items-center gap-3 py-10 text-center">
    <div class="text-sm font-medium">选择一条运行</div>
    <p class="text-sm text-slate-500">查看状态、错误和日志。</p>
  </div>
  <div v-else class="space-y-3">
    <div class="flex items-center justify-between gap-2">
      <div class="min-w-0">
        <div class="font-medium">运行详情</div>
        <div class="truncate text-xs text-slate-500">{{ run.id }}</div>
        <div class="mt-1 text-xs text-slate-500">
          <span v-if="run.siteAccount?.wechatAccount?.displayName" class="font-medium text-slate-700 dark:text-slate-200">
            {{ run.siteAccount.wechatAccount.displayName }}
          </span>
          <span v-if="run.siteAccount?.wechatAccount?.displayName"> · </span>
          {{ run.site?.name ?? run.task?.binding?.site?.name ?? '应用' }} ·
          {{ run.siteScript?.name ?? run.task?.capability ?? '任务' }}
          <span v-if="run.siteScript?.filePath"> · {{ run.siteScript.filePath }}</span>
        </div>
      </div>
      <div class="flex shrink-0 flex-wrap items-center gap-2">
        <button
          v-if="manualAction(run) === 'register'"
          class="btn-primary !px-3 !py-1.5"
          :disabled="actioning"
          @click="emit('action', run, 'register')"
        >
          <UserPlus class="h-3.5 w-3.5" /> {{ actioning ? '提交中…' : '一键注册' }}
        </button>
        <button class="btn-ghost !px-3 !py-1.5" :disabled="retrying" @click="emit('retry', run)">
          <RotateCcw class="h-3.5 w-3.5" :class="{ 'animate-spin': retrying }" /> 重跑
        </button>
      </div>
    </div>
    <div
      v-if="run.queue && (run.status === 'queued' || run.status === 'starting')"
      class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
    >
      <template v-if="run.status === 'starting'">
        已分配到执行槽位，正在启动…
      </template>
      <template v-else>
        排队第 <b>{{ run.queue.position }}</b> 位 · 前方 <b>{{ run.queue.ahead }}</b> 个 ·
        同时执行上限 {{ run.queue.concurrency }}
        <span v-if="run.queue.startsAt"> · 不早于 {{ formatTime(run.queue.startsAt) }}</span>
      </template>
    </div>
    <div class="grid grid-cols-2 gap-2 text-sm">
      <div class="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60">状态：{{ labelOf(runStatusLabels, run.status) }}</div>
      <div class="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60">耗时：{{ run.durationMs ?? '—' }}ms</div>
      <div class="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60">错误码：{{ run.errorCode ?? '—' }}</div>
      <div class="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60">开始：{{ formatTime(run.startedAt) }}</div>
      <div v-if="run.notBefore" class="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60">不早于：{{ formatTime(run.notBefore) }}</div>
    </div>
    <p
      v-if="run.errorMessage"
      class="rounded-xl px-3 py-2 text-sm"
      :class="run.status === 'skipped'
        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
        : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200'"
    >{{ run.errorMessage }}</p>
    <details
      v-if="run.status === 'failed' && hasDetails(run.summary)"
      open
      class="rounded-xl border border-red-200 bg-red-50/60 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
    >
      <summary class="cursor-pointer px-3 py-2 text-sm font-medium">错误详情</summary>
      <pre class="max-h-72 overflow-auto border-t border-red-200 px-3 py-2 font-mono text-xs whitespace-pre-wrap break-all dark:border-red-900/50">{{ pretty(run.summary) }}</pre>
    </details>
    <div ref="logBox" class="max-h-80 overflow-auto rounded-xl bg-slate-950 p-3 font-mono text-xs text-slate-200">
      <div v-if="!run.logs?.length" class="text-slate-500">{{ emptyLogText }}</div>
      <div v-for="log in run.logs" :key="log.id" class="space-y-1">
        <div :class="log.level === 'error' ? 'text-red-300' : log.level === 'warn' ? 'text-amber-300' : ''">
          [{{ log.level }}] {{ log.message }}
        </div>
        <details
          v-if="hasDetails(log.data)"
          :open="log.level === 'error'"
          class="ml-4 rounded-lg border border-slate-700/70 bg-slate-900/70"
        >
          <summary class="cursor-pointer px-2 py-1 text-[11px] text-slate-400">查看详情</summary>
          <pre class="max-h-56 overflow-auto border-t border-slate-700/70 px-2 py-1.5 text-[11px] whitespace-pre-wrap break-all text-slate-300">{{ pretty(log.data) }}</pre>
        </details>
      </div>
    </div>
  </div>
</template>
