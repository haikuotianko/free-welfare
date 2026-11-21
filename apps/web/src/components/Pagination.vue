<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    page: number;
    total: number;
    pageSize?: number;
    unit?: string;
  }>(),
  { pageSize: 20, unit: '条' },
);
const emit = defineEmits<{ 'update:page': [page: number] }>();

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));

function go(page: number) {
  emit('update:page', Math.min(totalPages.value, Math.max(1, page)));
}
</script>

<template>
  <div v-if="total > pageSize" class="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-slate-500">
    <span>共 {{ total }} {{ unit }}</span>
    <div class="flex items-center gap-1">
      <button class="btn-ghost !px-2.5 !py-1 text-xs" :disabled="page <= 1" @click="go(page - 1)">
        上一页
      </button>
      <span class="px-1">第 {{ page }} / {{ totalPages }} 页</span>
      <button class="btn-ghost !px-2.5 !py-1 text-xs" :disabled="page >= totalPages" @click="go(page + 1)">
        下一页
      </button>
    </div>
  </div>
</template>
