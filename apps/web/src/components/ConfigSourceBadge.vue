<script setup lang="ts">
import { computed } from 'vue';
import type { ConfigSource } from '../lib/api';

const props = defineProps<{ source?: ConfigSource }>();

const label = computed(() => {
  if (props.source === 'env') return '环境变量';
  if (props.source === 'database') return '已保存';
  if (props.source === 'default') return '默认值';
  return '未配置';
});

const title = computed(() => {
  if (props.source === 'env') return '来自 .env 或容器环境变量';
  if (props.source === 'database') return '已在设置页保存到数据库';
  if (props.source === 'default') return '使用内置默认值';
  return '尚未配置';
});

const classes = computed(() => {
  if (props.source === 'env') {
    return 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:ring-sky-900';
  }
  if (props.source === 'database') {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900';
  }
  return 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700';
});
</script>

<template>
  <span
    v-if="source"
    class="inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset"
    :class="classes"
    :title="title"
  >
    {{ label }}
  </span>
</template>
