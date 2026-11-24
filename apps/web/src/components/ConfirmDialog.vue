<script setup lang="ts">
import { X } from 'lucide-vue-next';
import { useEscapeClose } from '../lib/modal-escape';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    loading?: boolean;
  }>(),
  {
    title: '确认',
    confirmText: '确定',
    cancelText: '取消',
    loading: false,
  },
);

const emit = defineEmits<{ confirm: []; cancel: [] }>();

useEscapeClose(
  () => {
    if (!props.loading) emit('cancel');
  },
  () => props.open,
);
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4"
    role="dialog"
    aria-modal="true"
    @pointerdown.self="!loading && emit('cancel')"
  >
    <div class="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-2xl">
      <div class="flex items-start justify-between gap-2 border-b border-slate-100 p-4 dark:border-slate-800">
        <div class="text-sm font-semibold">{{ title }}</div>
        <button class="btn-ghost !px-2 !py-1.5" type="button" :disabled="loading" @click="emit('cancel')">
          <X class="h-4 w-4" />
        </button>
      </div>
      <div class="min-h-0 flex-1 overflow-auto p-4">
        <p class="whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{{ message }}</p>
      </div>
      <div class="flex justify-end gap-2 border-t border-slate-100 p-4 dark:border-slate-800">
        <button class="btn-ghost" type="button" :disabled="loading" @click="emit('cancel')">
          {{ cancelText }}
        </button>
        <button class="btn-primary" type="button" :disabled="loading" @click="emit('confirm')">
          {{ loading ? '处理中…' : confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>
