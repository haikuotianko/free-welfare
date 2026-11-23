<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { CalendarClock, X } from 'lucide-vue-next';
import { describeCron, isValidCron, parseCron, WEEKDAYS, type CronMode } from '../lib/cron';
import { useEscapeClose } from '../lib/modal-escape';

const props = defineProps<{ open: boolean; value: string }>();
const emit = defineEmits<{ close: []; save: [cron: string] }>();

const mode = ref<CronMode>('daily');
const time = ref('08:00');
const weekday = ref(1);
const monthDay = ref(1);
const interval = ref(30);
const hourlyMinute = ref(0);
const custom = ref('0 8 * * *');

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function parseTime(value: string) {
  const [hour, minute] = value.split(':').map((item) => Number(item));
  return {
    hour: Number.isFinite(hour) ? Math.min(23, Math.max(0, hour)) : 8,
    minute: Number.isFinite(minute) ? Math.min(59, Math.max(0, minute)) : 0,
  };
}

function applyValue(value: string) {
  if (!value.trim()) {
    mode.value = 'daily';
    time.value = '08:00';
    weekday.value = 1;
    monthDay.value = 1;
    interval.value = 30;
    hourlyMinute.value = 0;
    custom.value = '0 8 * * *';
    return;
  }
  const parsed = parseCron(value);
  mode.value = parsed.mode;
  time.value = `${pad(parsed.hour)}:${pad(parsed.minute)}`;
  weekday.value = parsed.weekday;
  monthDay.value = parsed.day;
  interval.value = parsed.interval;
  hourlyMinute.value = parsed.minute;
  custom.value = value || '0 8 * * *';
}

watch(
  () => [props.open, props.value] as const,
  ([open]) => {
    if (open) applyValue(props.value);
  },
  { immediate: true },
);

const cron = computed(() => {
  const { hour, minute } = parseTime(time.value);
  switch (mode.value) {
    case 'daily':
      return `${minute} ${hour} * * *`;
    case 'weekly':
      return `${minute} ${hour} * * ${weekday.value}`;
    case 'monthly':
      return `${minute} ${hour} ${monthDay.value} * *`;
    case 'interval':
      return `*/${interval.value} * * * *`;
    case 'hourly':
      return `${hourlyMinute.value} * * * *`;
    default:
      return custom.value.trim();
  }
});

const summary = computed(() => describeCron(cron.value));
const valid = computed(() => isValidCron(cron.value));

function applyPreset(nextMode: CronMode, presetTime?: string, presetWeekday?: number) {
  mode.value = nextMode;
  if (presetTime) time.value = presetTime;
  if (presetWeekday !== undefined) weekday.value = presetWeekday;
}

function save() {
  if (!valid.value) return;
  emit('save', cron.value);
  emit('close');
}

function clearCron() {
  emit('save', '');
  emit('close');
}

useEscapeClose(() => emit('close'), () => props.open);
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4"
    @pointerdown.self="emit('close')"
  >
    <div class="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-2xl">
      <div class="flex items-start justify-between gap-2 border-b border-slate-100 p-4 dark:border-slate-800">
        <div>
          <div class="flex items-center gap-2 text-sm font-semibold">
            <CalendarClock class="h-4 w-4 text-brand-600" /> 定时设置
          </div>
          <div class="mt-1 text-xs text-slate-500">不用手写 cron，选择运行频率即可。</div>
        </div>
        <button class="btn-ghost !px-2 !py-1.5" @click="emit('close')">
          <X class="h-4 w-4" />
        </button>
      </div>

      <div class="flex-1 space-y-4 overflow-auto p-4">
        <div class="rounded-xl bg-brand-50 px-3 py-2 dark:bg-slate-800/60">
          <div class="text-sm font-medium text-brand-700 dark:text-brand-100">{{ summary }}</div>
          <div class="mt-1 font-mono text-[11px] text-slate-500">{{ cron || '—' }}</div>
        </div>

        <div class="flex flex-wrap gap-1.5">
          <button class="chip bg-slate-100 dark:bg-slate-800" type="button" @click="applyPreset('daily', '08:00')">每天 08:00</button>
          <button class="chip bg-slate-100 dark:bg-slate-800" type="button" @click="applyPreset('weekly', '08:00', 1)">每周一 08:00</button>
          <button class="chip bg-slate-100 dark:bg-slate-800" type="button" @click="applyPreset('monthly', '08:00')">每月 1 日 08:00</button>
          <button class="chip bg-slate-100 dark:bg-slate-800" type="button" @click="applyPreset('interval')">每 30 分钟</button>
        </div>

        <div class="space-y-1">
          <label class="label !mb-0">频率</label>
          <select v-model="mode" class="input">
            <option value="daily">每天</option>
            <option value="weekly">每周</option>
            <option value="monthly">每月</option>
            <option value="interval">每隔几分钟</option>
            <option value="hourly">每小时</option>
            <option value="custom">自定义 cron</option>
          </select>
        </div>

        <div v-if="mode === 'daily' || mode === 'weekly' || mode === 'monthly'" class="grid gap-3 sm:grid-cols-2">
          <div v-if="mode === 'weekly'" class="space-y-1">
            <label class="label !mb-0">星期</label>
            <select v-model.number="weekday" class="input">
              <option v-for="(label, index) in WEEKDAYS" :key="label" :value="index">{{ label }}</option>
            </select>
          </div>
          <div v-if="mode === 'monthly'" class="space-y-1">
            <label class="label !mb-0">日期</label>
            <input v-model.number="monthDay" type="number" min="1" max="31" class="input" />
          </div>
          <div class="space-y-1">
            <label class="label !mb-0">时间</label>
            <input v-model="time" type="time" class="input" />
          </div>
        </div>

        <div v-if="mode === 'interval'" class="space-y-1">
          <label class="label !mb-0">间隔分钟</label>
          <input v-model.number="interval" type="number" min="1" max="59" class="input" />
          <p class="text-xs text-slate-500">例如 30 表示每 30 分钟执行一次。</p>
        </div>

        <div v-if="mode === 'hourly'" class="space-y-1">
          <label class="label !mb-0">每小时第几分钟</label>
          <input v-model.number="hourlyMinute" type="number" min="0" max="59" class="input" />
        </div>

        <div v-if="mode === 'custom'" class="space-y-1">
          <label class="label !mb-0">cron 表达式</label>
          <input v-model="custom" class="input font-mono text-xs" placeholder="0 8 * * *" />
          <p class="text-xs text-slate-500">5 段：分 时 日 月 周。复杂表达式会按自定义显示。</p>
        </div>

        <p class="text-xs text-slate-500">按本地时间执行（默认服务器/浏览器时区）；留空表示不自动运行。</p>
      </div>

      <div class="flex flex-wrap justify-end gap-2 border-t border-slate-100 p-4 dark:border-slate-800">
        <button class="btn-ghost" @click="emit('close')">取消</button>
        <button class="btn-ghost" @click="clearCron">清空定时</button>
        <button class="btn-primary" :disabled="!valid" @click="save">应用定时</button>
      </div>
    </div>
  </div>
</template>
