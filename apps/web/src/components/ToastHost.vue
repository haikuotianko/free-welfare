<script setup lang="ts">
import { AlertCircle, CheckCircle2, X } from 'lucide-vue-next';
import { useToast } from '../lib/toast';

const { items, dismiss } = useToast();
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 top-20 z-[80] flex flex-col items-center gap-2 px-4">
    <div
      v-for="item in items"
      :key="item.id"
      class="pointer-events-auto flex max-w-[92vw] items-start gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white shadow-xl"
      :class="item.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'"
      role="status"
    >
      <CheckCircle2 v-if="item.type === 'success'" class="mt-0.5 h-4 w-4 shrink-0" />
      <AlertCircle v-else class="mt-0.5 h-4 w-4 shrink-0" />
      <span class="min-w-0">
        {{ item.text }}
        <RouterLink
          v-if="item.link"
          :to="item.link.to"
          class="ml-2 underline decoration-white/60 underline-offset-2 hover:decoration-white"
          @click="dismiss(item.id)"
        >
          {{ item.link.text }}
        </RouterLink>
      </span>
      <button
        class="ml-1 shrink-0 rounded p-0.5 text-white/80 transition hover:text-white"
        title="关闭"
        @click="dismiss(item.id)"
      >
        <X class="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
</template>
