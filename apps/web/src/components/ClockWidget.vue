<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ChevronDown, Clock, Settings, Timer } from 'lucide-vue-next';
import type { ClockUpcomingItem } from '../lib/api';
import { useClock } from '../stores/clock';
import { subscribeRunEvents } from '../stores/runEvents';

const router = useRouter();
const clock = useClock();
const { data, current } = clock;
const open = ref(false);
let unsubscribeEvents: (() => void) | null = null;
let refreshTimer: number | null = null;

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
});

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const upcoming = computed(() => data.value?.upcoming ?? []);
const next = computed(() => upcoming.value[0] ?? null);
const active = computed(() => data.value?.active ?? { running: 0, queued: 0 });

function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    void clock.load();
  }, 250);
}

function timeText(date: Date) {
  return timeFormatter.format(date);
}

function dateText(date: Date) {
  return dateFormatter.format(date);
}

function dateTimeText(iso: string) {
  return dateTimeFormatter.format(new Date(iso));
}

function remaining(item: ClockUpcomingItem) {
  return Math.max(0, Math.floor((Date.parse(item.nextRunAt) - current.value.getTime()) / 1000));
}

function formatRemaining(seconds: number) {
  if (seconds <= 0) return '即将运行';
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分 ${seconds % 60} 秒`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 时 ${minutes % 60} 分`;
  const days = Math.floor(hours / 24);
  return `${days} 天 ${hours % 24} 时`;
}

function goSettings() {
  void router.push('/time');
}

function closeOnOutside() {
  open.value = false;
}

onMounted(() => {
  clock.start();
  unsubscribeEvents = subscribeRunEvents((event) => {
    if (event.type === 'run') scheduleRefresh();
  });
  document.addEventListener('click', closeOnOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', closeOnOutside);
  unsubscribeEvents?.();
  unsubscribeEvents = null;
  if (refreshTimer) window.clearTimeout(refreshTimer);
  refreshTimer = null;
  clock.stop();
});
</script>

<template>
  <div class="relative flex items-center gap-1.5">
    <button
      class="min-h-10 rounded-xl px-2 py-1.5 text-right transition hover:bg-slate-100 dark:hover:bg-slate-800"
      title="时间设置"
      @click="goSettings"
    >
      <div class="font-mono text-sm font-semibold leading-none">{{ timeText(current) }}</div>
      <div class="mt-1 hidden text-[10px] text-slate-500 sm:block">
        本地时间 · {{ data?.mode === 'manual' ? '手动' : '自动' }}
      </div>
    </button>

    <button
      class="flex min-h-10 items-center gap-1 rounded-xl border border-slate-200 px-2 py-1.5 text-xs text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      :title="active.running > 0 ? '有任务正在运行' : active.queued > 0 ? '有任务正在排队' : '下一个脚本运行时间'"
      @click.stop="open = !open"
    >
      <Timer class="h-3.5 w-3.5 text-brand-600 dark:text-brand-300" />
      <span v-if="active.running > 0" class="flex items-center gap-1 font-medium text-amber-600 dark:text-amber-300">
        <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500"></span>
        运行中
      </span>
      <span v-else-if="active.queued > 0" class="font-mono text-amber-600 dark:text-amber-300">排队 {{ active.queued }}</span>
      <span v-else class="hidden font-mono sm:inline">{{ next ? formatRemaining(remaining(next)) : '—' }}</span>
      <ChevronDown class="h-3 w-3" :class="{ 'rotate-180': open }" />
    </button>

    <div
      v-if="open"
      class="absolute right-0 top-full z-30 mt-2 w-[21rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
      @click.stop
    >
      <div class="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800">
        <div>
          <div class="text-xs font-semibold">接下来运行</div>
          <div class="text-[10px] text-slate-500">{{ dateText(current) }} · 本地时间</div>
        </div>
        <button class="btn-ghost !px-2 !py-1.5" title="时间设置" @click="goSettings">
          <Settings class="h-4 w-4" />
        </button>
      </div>

      <div v-if="active.running > 0 || active.queued > 0" class="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-[10px] dark:border-slate-800">
        <span class="chip bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200">运行中 {{ active.running }}</span>
        <span class="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">排队中 {{ active.queued }}</span>
      </div>

      <div v-if="upcoming.length === 0" class="px-4 py-8 text-center text-xs text-slate-500">
        暂无已启用的定时脚本。
      </div>
      <div v-else class="max-h-80 overflow-auto">
        <div
          v-for="item in upcoming.slice(0, 20)"
          :key="item.scriptId"
          class="flex items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-0 dark:border-slate-800"
        >
          <div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
            <img v-if="item.siteIconUrl" :src="item.siteIconUrl" alt="" class="h-full w-full object-cover" />
            <span v-else>{{ item.siteName.slice(0, 1) }}</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="truncate text-xs font-medium">{{ item.siteName }} · {{ item.scriptName }}</div>
            <div class="mt-0.5 text-[10px] text-slate-500">{{ dateTimeText(item.nextRunAt) }}</div>
          </div>
          <div class="shrink-0 rounded-lg bg-brand-50 px-2 py-1 font-mono text-[11px] text-brand-700 dark:bg-brand-900/30 dark:text-brand-200">
            {{ formatRemaining(remaining(item)) }}
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-[10px] text-slate-500 dark:border-slate-800">
        <span class="inline-flex items-center gap-1"><Clock class="h-3 w-3" /> {{ timeText(current) }}</span>
        <RouterLink to="/runs" class="hover:underline" @click="open = false">查看运行记录 →</RouterLink>
      </div>
    </div>
  </div>
</template>
