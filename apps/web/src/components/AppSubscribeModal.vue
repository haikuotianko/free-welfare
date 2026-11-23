<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-vue-next';
import type { Site } from '../lib/api';
import { useEscapeClose } from '../lib/modal-escape';

type SiteOption = Pick<Site, 'id' | 'key' | 'name' | 'appId' | 'pointsName'>;

const props = defineProps<{
  accountName: string;
  available: SiteOption[];
  subscribed: SiteOption[];
  saving?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  save: [payload: { addSiteIds: string[]; removeSiteIds: string[] }];
}>();

const workingAvailable = ref<SiteOption[]>([...props.available]);
const workingSubscribed = ref<SiteOption[]>([...props.subscribed]);
const initialSubscribed = new Set(props.subscribed.map((site) => site.id));
const query = ref('');
const selectedAvailable = ref<string[]>([]);
const selectedSubscribed = ref<string[]>([]);

function matches(site: SiteOption) {
  const value = query.value.trim().toLowerCase();
  if (!value) return true;
  return [site.name, site.key, site.appId, site.pointsName]
    .filter(Boolean)
    .some((item) => String(item).toLowerCase().includes(value));
}

const filteredAvailable = computed(() => workingAvailable.value.filter(matches));
const filteredSubscribed = computed(() => workingSubscribed.value.filter(matches));

const currentSubscribedIds = computed(() => new Set(workingSubscribed.value.map((site) => site.id)));
const addCount = computed(
  () => workingSubscribed.value.filter((site) => !initialSubscribed.has(site.id)).length,
);
const removeCount = computed(
  () => [...initialSubscribed].filter((id) => !currentSubscribedIds.value.has(id)).length,
);
const hasChanges = computed(() => addCount.value > 0 || removeCount.value > 0);

function toggleAvailable(id: string) {
  selectedAvailable.value = selectedAvailable.value.includes(id)
    ? selectedAvailable.value.filter((item) => item !== id)
    : [...selectedAvailable.value, id];
}

function toggleSubscribed(id: string) {
  selectedSubscribed.value = selectedSubscribed.value.includes(id)
    ? selectedSubscribed.value.filter((item) => item !== id)
    : [...selectedSubscribed.value, id];
}

function addSelected() {
  const ids = new Set(selectedAvailable.value);
  const moved = workingAvailable.value.filter((site) => ids.has(site.id));
  workingAvailable.value = workingAvailable.value.filter((site) => !ids.has(site.id));
  for (const site of moved) {
    if (!workingSubscribed.value.some((item) => item.id === site.id)) {
      workingSubscribed.value.push(site);
    }
  }
  selectedAvailable.value = [];
}

function removeSelected() {
  const ids = new Set(selectedSubscribed.value);
  const moved = workingSubscribed.value.filter((site) => ids.has(site.id));
  workingSubscribed.value = workingSubscribed.value.filter((site) => !ids.has(site.id));
  for (const site of moved) {
    if (!workingAvailable.value.some((item) => item.id === site.id)) {
      workingAvailable.value.push(site);
    }
  }
  selectedSubscribed.value = [];
}

function close() {
  if (!props.saving) emit('close');
}

function save() {
  if (!hasChanges.value || props.saving) return;
  emit('save', {
    addSiteIds: workingSubscribed.value
      .filter((site) => !initialSubscribed.has(site.id))
      .map((site) => site.id),
    removeSiteIds: [...initialSubscribed].filter((id) => !currentSubscribedIds.value.has(id)),
  });
}

watch(query, () => {
  selectedAvailable.value = [];
  selectedSubscribed.value = [];
});

useEscapeClose(close);
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4"
    @pointerdown.self="close"
  >
    <div
      class="flex max-h-[94vh] w-full max-w-5xl flex-col rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-2xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="subscribe-title"
    >
      <div class="flex items-start justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
        <div>
          <h2 id="subscribe-title" class="text-sm font-semibold">管理订阅应用</h2>
          <p class="mt-1 text-xs text-slate-500">
            {{ accountName }} · 左侧选择要添加的应用，右侧移除已订阅的应用
          </p>
        </div>
        <button type="button" class="btn-ghost !px-2 !py-1.5" :disabled="saving" aria-label="关闭" @click="close">
          <X class="h-4 w-4" />
        </button>
      </div>

      <div class="border-b border-slate-100 p-4 dark:border-slate-800">
        <div class="relative">
          <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            v-model="query"
            type="text"
            class="input !pl-9 !pr-9"
            placeholder="搜索应用名称、key、AppID"
          />
          <button
            v-if="query"
            type="button"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
            title="清空搜索"
            @click="query = ''"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-4">
        <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <section class="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
            <div class="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-800/50">
              <span class="font-medium">可添加</span>
              <span class="text-slate-500">{{ filteredAvailable.length }} / {{ workingAvailable.length }}</span>
            </div>
            <div class="max-h-[38vh] min-h-40 overflow-y-auto p-1.5 md:max-h-[48vh]">
              <label
                v-for="site in filteredAvailable"
                :key="site.id"
                class="flex cursor-pointer items-start gap-2 rounded-lg border border-transparent px-2 py-2 transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
                :class="selectedAvailable.includes(site.id) ? 'border-brand-200 bg-brand-50/60 dark:border-brand-800/60 dark:bg-brand-900/20' : ''"
              >
                <input
                  type="checkbox"
                  class="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
                  :checked="selectedAvailable.includes(site.id)"
                  @change="toggleAvailable(site.id)"
                />
                <span class="min-w-0">
                  <span class="block truncate text-sm">{{ site.name }}</span>
                  <span class="mt-0.5 block truncate text-[11px] text-slate-500">
                    {{ site.key }} · {{ site.appId }}<template v-if="site.pointsName"> · {{ site.pointsName }}</template>
                  </span>
                </span>
              </label>
              <p v-if="filteredAvailable.length === 0" class="px-3 py-8 text-center text-xs text-slate-500">
                没有可添加的应用
              </p>
            </div>
          </section>

          <div class="flex items-center justify-center gap-2 md:flex-col">
            <button
              type="button"
              class="btn-ghost !px-3 !py-1.5 text-xs"
              :disabled="selectedAvailable.length === 0 || saving"
              @click="addSelected"
            >
              <ChevronRight class="h-4 w-4" />
              添加
            </button>
            <button
              type="button"
              class="btn-ghost !px-3 !py-1.5 text-xs"
              :disabled="selectedSubscribed.length === 0 || saving"
              @click="removeSelected"
            >
              <ChevronLeft class="h-4 w-4" />
              移除
            </button>
          </div>

          <section class="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
            <div class="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-800/50">
              <span class="font-medium">已订阅</span>
              <span class="text-slate-500">{{ filteredSubscribed.length }} / {{ workingSubscribed.length }}</span>
            </div>
            <div class="max-h-[38vh] min-h-40 overflow-y-auto p-1.5 md:max-h-[48vh]">
              <label
                v-for="site in filteredSubscribed"
                :key="site.id"
                class="flex cursor-pointer items-start gap-2 rounded-lg border border-transparent px-2 py-2 transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
                :class="selectedSubscribed.includes(site.id) ? 'border-brand-200 bg-brand-50/60 dark:border-brand-800/60 dark:bg-brand-900/20' : ''"
              >
                <input
                  type="checkbox"
                  class="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
                  :checked="selectedSubscribed.includes(site.id)"
                  @change="toggleSubscribed(site.id)"
                />
                <span class="min-w-0">
                  <span class="block truncate text-sm">{{ site.name }}</span>
                  <span class="mt-0.5 block truncate text-[11px] text-slate-500">
                    {{ site.key }} · {{ site.appId }}<template v-if="site.pointsName"> · {{ site.pointsName }}</template>
                  </span>
                </span>
              </label>
              <p v-if="filteredSubscribed.length === 0" class="px-3 py-8 text-center text-xs text-slate-500">
                还没有订阅应用
              </p>
            </div>
          </section>
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-4 dark:border-slate-800">
        <div class="text-xs text-slate-500">
          将添加 <b class="text-slate-700 dark:text-slate-200">{{ addCount }}</b> 个，移除
          <b class="text-slate-700 dark:text-slate-200">{{ removeCount }}</b> 个
          <span v-if="hasChanges" class="ml-1">· 移除只解除绑定，不删除应用</span>
        </div>
        <div class="flex gap-2">
          <button type="button" class="btn-ghost" :disabled="saving" @click="close">取消</button>
          <button type="button" class="btn-primary" :disabled="!hasChanges || saving" @click="save">
            {{ saving ? '保存中…' : '保存更改' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
