<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    items: Array<{ id: string; label: string }>;
    title?: string;
    offset?: number;
  }>(),
  { title: '页面导航', offset: 88 },
);

const active = ref(props.items[0]?.id ?? '');
let ticking = false;

function updateActive() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    let current = props.items[0]?.id ?? '';
    for (const item of props.items) {
      const element = document.getElementById(item.id);
      if (!element) continue;
      if (element.getBoundingClientRect().top <= props.offset + 24) current = item.id;
    }
    const documentHeight = document.documentElement.scrollHeight;
    if (window.scrollY + window.innerHeight >= documentHeight - 8) {
      current = props.items[props.items.length - 1]?.id ?? current;
    }
    active.value = current;
  });
}

function scrollTo(id: string) {
  const element = document.getElementById(id);
  if (!element) return;
  active.value = id;
  window.scrollTo({
    top: element.getBoundingClientRect().top + window.scrollY - props.offset,
    behavior: 'smooth',
  });
}

onMounted(() => {
  updateActive();
  window.addEventListener('scroll', updateActive, { passive: true });
  window.addEventListener('resize', updateActive);
});

onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateActive);
  window.removeEventListener('resize', updateActive);
});
</script>

<template>
  <nav
    class="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    aria-label="页面导航"
  >
    <div class="px-2 py-1.5 text-[11px] font-medium tracking-wide text-slate-400">{{ title }}</div>
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      class="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition"
      :class="
        active === item.id
          ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-900/30 dark:text-brand-100'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
      "
      :aria-current="active === item.id ? 'true' : undefined"
      @click="scrollTo(item.id)"
    >
      {{ item.label }}
    </button>
  </nav>
</template>
