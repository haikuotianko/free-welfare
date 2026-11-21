<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Clock, RefreshCw, Save, Wifi } from 'lucide-vue-next';
import { api, type ClockData } from '../lib/api';
import { useClock } from '../stores/clock';

const clock = useClock();
const { data, current } = clock;
const sourceUrl = ref('');
const intervalMinutes = ref(5);
const manualInput = ref('');
const message = ref('');
const error = ref('');
const busy = ref(false);

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'long',
});

const timezone =
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const offsetText = computed(() => {
  const offset = data.value?.offsetMs ?? 0;
  if (offset === 0) return '0 秒';
  const seconds = Math.round(offset / 1000);
  return `${seconds > 0 ? '+' : ''}${seconds} 秒`;
});

const modeText = computed(() =>
  data.value?.mode === 'manual' ? '手动设置' : '自动同步',
);

function loadForm() {
  sourceUrl.value = data.value?.sourceUrl ?? '';
  intervalMinutes.value = Math.max(
    1,
    Math.round((data.value?.syncIntervalSeconds ?? 300) / 60),
  );
  if (!manualInput.value) manualInput.value = localInput(current.value);
}

function localInput(date: Date) {
  const text = new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  return text.replace(' ', 'T');
}

function toLocalIso(value: string) {
  const text = value.trim();
  if (!text) return '';
  const withSeconds = text.length === 16 ? text + ':00' : text;
  return new Date(withSeconds).toISOString();
}

async function refresh() {
  await clock.load();
  loadForm();
}

async function saveAuto() {
  error.value = '';
  message.value = '';
  busy.value = true;
  try {
    const url = sourceUrl.value.trim();
    await api.patch<ClockData>('/clock', {
      mode: 'auto',
      sourceUrl: url,
      syncIntervalSeconds: Math.max(60, Math.round(intervalMinutes.value * 60)),
    });
    if (url) {
      try {
        await api.post('/clock/sync');
        message.value = '自动同步已保存，并完成一次校时';
      } catch (e) {
        message.value = '自动同步已保存，但校时失败';
        error.value = e instanceof Error ? e.message : '校时失败';
      }
    } else {
      message.value = '自动同步已保存；填写网址后会自动校时';
    }
    await refresh();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败';
  } finally {
    busy.value = false;
  }
}

async function syncNow() {
  error.value = '';
  message.value = '';
  busy.value = true;
  try {
    await api.post('/clock/sync');
    await refresh();
    message.value = '校时成功';
  } catch (e) {
    error.value = e instanceof Error ? e.message : '校时失败';
    await refresh();
  } finally {
    busy.value = false;
  }
}

async function saveManual() {
  error.value = '';
  message.value = '';
  const iso = toLocalIso(manualInput.value);
  if (!iso) {
    error.value = '请选择手动时间';
    return;
  }
  busy.value = true;
  try {
    await api.patch<ClockData>('/clock', {
      mode: 'manual',
      manualTime: iso,
    });
    await refresh();
    message.value = '已切换为手动时间';
  } catch (e) {
    error.value = e instanceof Error ? e.message : '设置失败';
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  clock.start();
  await refresh();
});
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 class="text-lg font-semibold">时间设置</h2>
        <p class="text-sm text-slate-500">
          顶部时间默认按本地时区（{{ timezone }}）显示；这里只校正平台时间和定时任务，不修改宿主机系统时间。
        </p>
      </div>
      <button class="btn-ghost !px-3 !py-1.5" :disabled="busy" @click="refresh">
        <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': busy }" /> 刷新
      </button>
    </div>

    <p v-if="error" class="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{{ error }}</p>
    <p v-if="message" class="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">{{ message }}</p>

    <div class="card space-y-3">
      <div class="flex items-center gap-2">
        <Clock class="h-4 w-4 text-slate-500" />
        <h3 class="text-sm font-semibold">当前平台时间</h3>
      </div>
      <div class="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <div class="font-mono text-3xl font-semibold">{{ timeFormatter.format(current) }}</div>
          <div class="mt-1 text-xs text-slate-500">{{ dateFormatter.format(current) }} · 本地时间（{{ timezone }}）</div>
        </div>
        <div class="flex flex-wrap gap-2 text-xs">
          <span class="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{{ modeText }}</span>
          <span class="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">偏移 {{ offsetText }}</span>
          <span v-if="data?.lastSyncedAt" class="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            上次校时 {{ new Date(data.lastSyncedAt).toLocaleString('zh-CN', { hour12: false }) }}
          </span>
        </div>
      </div>
      <div v-if="data?.lastError" class="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        最近一次校时失败：{{ data.lastError }}
      </div>
    </div>

    <form class="card space-y-4" @submit.prevent="saveAuto">
      <div class="flex items-center gap-2">
        <Wifi class="h-4 w-4 text-slate-500" />
        <h3 class="text-sm font-semibold">自动同步时间</h3>
      </div>
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="sm:col-span-2">
          <label class="label">时间同步网址</label>
          <input
            v-model="sourceUrl"
            class="input font-mono text-xs"
            :placeholder="`https://worldtimeapi.org/api/timezone/${timezone}`"
          />
          <p class="mt-1 text-[11px] text-slate-500">
            支持 HTTP Date 头、纯时间戳、ISO 时间和常见 JSON 时间字段。
          </p>
        </div>
        <div>
          <label class="label">同步间隔（分钟）</label>
          <input v-model.number="intervalMinutes" type="number" min="1" max="1440" class="input" />
        </div>
      </div>
      <div class="flex flex-wrap justify-end gap-2">
        <button type="button" class="btn-ghost" :disabled="busy || !data?.sourceUrl" @click="syncNow">
          <RefreshCw class="h-4 w-4" /> 立即同步
        </button>
        <button class="btn-primary" type="submit" :disabled="busy">
          <Save class="h-4 w-4" /> 保存自动同步
        </button>
      </div>
    </form>

    <form class="card space-y-4" @submit.prevent="saveManual">
      <div class="flex items-center gap-2">
        <Clock class="h-4 w-4 text-slate-500" />
        <h3 class="text-sm font-semibold">手动设置时间</h3>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label class="label">平台时间（本地时间）</label>
          <input v-model="manualInput" type="datetime-local" class="input" />
        </div>
        <div class="flex items-end">
          <button class="btn-ghost" type="submit" :disabled="busy">
            <Save class="h-4 w-4" /> 设为手动时间
          </button>
        </div>
      </div>
      <p class="text-xs text-slate-500">
        手动设置后平台时间按该时间继续走，并影响脚本下一次运行时间；不会修改 NAS/服务器系统时间。当前本地时区：{{ timezone }}。
      </p>
    </form>

    <div class="card text-sm text-slate-500">
      <div class="font-medium text-slate-700 dark:text-slate-200">示例时间接口</div>
      <ul class="mt-2 list-disc space-y-1 pl-5 text-xs">
        <li><code class="font-mono">https://worldtimeapi.org/api/timezone/{{ timezone }}</code></li>
        <li><code class="font-mono">https://timeapi.io/api/Time/current/zone?timeZone={{ timezone }}</code></li>
        <li>自建接口返回 <code class="font-mono">{"timestamp":1700000000}</code> 或纯数字时间戳也可以。</li>
      </ul>
    </div>
  </div>
</template>
