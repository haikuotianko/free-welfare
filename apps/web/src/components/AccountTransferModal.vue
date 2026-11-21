<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ArrowLeft, ArrowRight, X } from 'lucide-vue-next';
import { api, type Site } from '../lib/api';
import { useAccountStore } from '../stores/account';

const props = defineProps<{ open: boolean; site: Site | null }>();
const emit = defineEmits<{ close: []; saved: [] }>();

const accountStore = useAccountStore();
const selectedIds = ref<string[]>([]);
const checkedLeft = ref<string[]>([]);
const checkedRight = ref<string[]>([]);
const searchLeft = ref('');
const searchRight = ref('');
const saving = ref(false);
const error = ref('');
let originalIds: string[] = [];

function matchesSearch(account: { displayName: string; openidMasked?: string | null }, keyword: string) {
  const query = keyword.trim().toLowerCase();
  if (!query) return true;
  return (
    account.displayName.toLowerCase().includes(query) ||
    String(account.openidMasked ?? '').toLowerCase().includes(query)
  );
}

const allAccounts = computed(() => accountStore.accounts);
const availableAccounts = computed(() =>
  allAccounts.value.filter((account) => !selectedIds.value.includes(account.id)),
);
const selectedAccounts = computed(() =>
  selectedIds.value.flatMap((id) => {
    const account = allAccounts.value.find((item) => item.id === id);
    return account ? [account] : [];
  }),
);
const filteredAvailableAccounts = computed(() =>
  availableAccounts.value.filter((account) => matchesSearch(account, searchLeft.value)),
);
const filteredSelectedAccounts = computed(() =>
  selectedAccounts.value.filter((account) => matchesSearch(account, searchRight.value)),
);

function toggle(list: 'left' | 'right', id: string) {
  const target = list === 'left' ? checkedLeft : checkedRight;
  target.value = target.value.includes(id)
    ? target.value.filter((item) => item !== id)
    : [...target.value, id];
}

function moveRight() {
  if (checkedLeft.value.length === 0) return;
  selectedIds.value = [...new Set([...selectedIds.value, ...checkedLeft.value])];
  checkedLeft.value = [];
}

function moveLeft() {
  if (checkedRight.value.length === 0) return;
  selectedIds.value = selectedIds.value.filter((id) => !checkedRight.value.includes(id));
  checkedRight.value = [];
}

async function save() {
  const site = props.site;
  if (!site) return;
  const removed = originalIds.filter((id) => !selectedIds.value.includes(id));
  if (
    removed.length > 0 &&
    !window.confirm(
      `将取消 ${removed.length} 个账号的应用订阅，该应用下这些账号的脚本/积分数据也会删除，确定？`,
    )
  ) {
    return;
  }

  saving.value = true;
  error.value = '';
  try {
    const added = selectedIds.value.filter((id) => !originalIds.includes(id));
    for (const id of added) {
      await api.post(`/sites/${site.id}/accounts`, { wechatAccountId: id });
    }
    for (const id of removed) {
      const link = accountStore.allSiteAccounts.find(
        (item) => item.siteId === site.id && item.wechatAccount.id === id,
      );
      if (link) await api.del(`/sites/${site.id}/accounts/${link.id}`);
    }
    await accountStore.load();
    emit('saved');
    emit('close');
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败';
  } finally {
    saving.value = false;
  }
}

watch(
  () => [props.open, props.site?.id] as const,
  async ([open]) => {
    if (!open) return;
    checkedLeft.value = [];
    checkedRight.value = [];
    searchLeft.value = '';
    searchRight.value = '';
    error.value = '';
    if (!accountStore.loaded) await accountStore.load();
    const bound = new Set(
      accountStore.allSiteAccounts
        .filter((item) => item.siteId === props.site?.id)
        .map((item) => item.wechatAccount.id),
    );
    selectedIds.value = allAccounts.value
      .filter((account) => bound.has(account.id))
      .map((account) => account.id);
    originalIds = [...selectedIds.value];
  },
  { immediate: true },
);
</script>

<template>
  <div
    v-if="open && site"
    class="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4"
    @pointerdown.self="emit('close')"
  >
    <div class="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-2xl">
      <div class="flex items-start justify-between gap-2 border-b border-slate-100 p-4 dark:border-slate-800">
        <div>
          <div class="text-sm font-semibold">编辑应用账号 · {{ site.name }}</div>
          <div class="mt-1 text-xs text-slate-500">
            左侧是未绑定账号，右侧是已绑定账号；勾选后使用箭头移动。
          </div>
        </div>
        <button class="btn-ghost !px-2 !py-1.5" :disabled="saving" @click="emit('close')">
          <X class="h-4 w-4" />
        </button>
      </div>

      <div class="flex-1 space-y-3 overflow-auto p-4">
        <p v-if="error" class="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
          {{ error }}
        </p>

        <div class="grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <div class="flex min-h-56 flex-col rounded-xl border border-slate-200 dark:border-slate-800">
            <div class="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-xs text-slate-500 dark:border-slate-800">
              <span class="font-medium text-slate-700 dark:text-slate-200">可选账号</span>
              <span>{{ availableAccounts.length }}</span>
            </div>
            <div class="border-b border-slate-100 p-2 dark:border-slate-800">
              <input v-model="searchLeft" class="input !py-1 text-xs" placeholder="搜索名称 / OpenID" />
            </div>
            <div class="flex-1 space-y-1 overflow-auto p-2">
              <p v-if="filteredAvailableAccounts.length === 0" class="px-2 py-4 text-center text-xs text-slate-500">
                {{ availableAccounts.length === 0 ? '没有可选账号' : '没有匹配账号' }}
              </p>
              <label
                v-for="account in filteredAvailableAccounts"
                :key="account.id"
                class="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <input
                  type="checkbox"
                  class="mt-0.5 h-3.5 w-3.5"
                  :checked="checkedLeft.includes(account.id)"
                  @change="toggle('left', account.id)"
                />
                <span class="min-w-0">
                  <span class="block truncate font-medium">{{ account.displayName }}</span>
                  <span class="block truncate text-[11px] text-slate-500">
                    YYB #{{ account.yybRef }}<span v-if="account.openidMasked"> · {{ account.openidMasked }}</span>
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div class="flex items-center justify-center gap-2 sm:flex-col">
            <button
              class="btn-ghost !px-2.5 !py-2"
              type="button"
              title="添加选中账号"
              :disabled="checkedLeft.length === 0"
              @click="moveRight"
            >
              <ArrowRight class="h-4 w-4" />
            </button>
            <button
              class="btn-ghost !px-2.5 !py-2"
              type="button"
              title="移除选中账号"
              :disabled="checkedRight.length === 0"
              @click="moveLeft"
            >
              <ArrowLeft class="h-4 w-4" />
            </button>
          </div>

          <div class="flex min-h-56 flex-col rounded-xl border border-slate-200 dark:border-slate-800">
            <div class="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-xs text-slate-500 dark:border-slate-800">
              <span class="font-medium text-slate-700 dark:text-slate-200">已绑定账号</span>
              <span>{{ selectedAccounts.length }}</span>
            </div>
            <div class="border-b border-slate-100 p-2 dark:border-slate-800">
              <input v-model="searchRight" class="input !py-1 text-xs" placeholder="搜索名称 / OpenID" />
            </div>
            <div class="flex-1 space-y-1 overflow-auto p-2">
              <p v-if="filteredSelectedAccounts.length === 0" class="px-2 py-4 text-center text-xs text-slate-500">
                {{ selectedAccounts.length === 0 ? '还没有绑定账号' : '没有匹配账号' }}
              </p>
              <label
                v-for="account in filteredSelectedAccounts"
                :key="account.id"
                class="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <input
                  type="checkbox"
                  class="mt-0.5 h-3.5 w-3.5"
                  :checked="checkedRight.includes(account.id)"
                  @change="toggle('right', account.id)"
                />
                <span class="min-w-0">
                  <span class="block truncate font-medium">{{ account.displayName }}</span>
                  <span class="block truncate text-[11px] text-slate-500">
                    YYB #{{ account.yybRef }}<span v-if="account.openidMasked"> · {{ account.openidMasked }}</span>
                  </span>
                </span>
              </label>
            </div>
          </div>
        </div>

        <p class="text-xs text-slate-500">
          移除账号会取消该账号在此应用下的订阅，并删除对应的脚本/积分数据。
        </p>
      </div>

      <div class="flex justify-end gap-2 border-t border-slate-100 p-4 dark:border-slate-800">
        <button class="btn-ghost" :disabled="saving" @click="emit('close')">取消</button>
        <button class="btn-primary" :disabled="saving" @click="save">
          {{ saving ? '保存中…' : '保存账号' }}
        </button>
      </div>
    </div>
  </div>
</template>
