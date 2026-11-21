<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { CalendarCheck, ChevronDown, ChevronRight, FileText, QrCode, RefreshCw, Send, X } from 'lucide-vue-next';
import { api, type AccountOverview, type Activity, type Run } from '../lib/api';
import { queueTicketText } from '../lib/labels';
import { useAccountStore } from '../stores/account';
import Pagination from '../components/Pagination.vue';

interface ActivityGroup {
  siteId: string;
  siteName: string;
  pointsName: string;
  rows: Activity[];
  completed: number;
  types: string[];
  lastSyncedAt: string;
}

const accountStore = useAccountStore();
const rows = ref<Activity[]>([]);
const accounts = ref<AccountOverview[]>([]);
const loading = ref(false);
const error = ref('');
const message = ref('');
const lastRunId = ref('');
const selectedAccountId = ref('');

const expandedGroups = ref<Set<string>>(new Set());
const groupPages = ref<Record<string, number>>({});
const groupPageSize = 10;
const activeActivity = ref<Activity | null>(null);
const manualActivity = ref<Activity | null>(null);
const formValues = ref<Record<string, string>>({});
const formError = ref('');
const submitting = ref(false);

const selectedAccount = computed(
  () => accounts.value.find((account) => account.id === selectedAccountId.value) ?? null,
);

const accountSiteIds = computed(
  () => new Set(selectedAccount.value?.siteAccounts.map((item) => item.siteId) ?? []),
);

function isSignIn(row: Activity) {
  if (row.action === 'sign_in') return true;
  if (/^(sign_in|signin|checkin|check_in|daily_sign)$/i.test(row.type)) return true;
  if (/签到|打卡/.test(row.name)) return true;
  return /(^|[._-])(sign[-_]?in|check[-_]?in|daily[-_]?sign)([._-]|$)/i.test(row.externalId);
}

const filteredRows = computed(() =>
  selectedAccount.value
    ? rows.value.filter(
        (row) => row.site && accountSiteIds.value.has(row.site.id) && !isSignIn(row),
      )
    : [],
);

const statusRank: Record<string, number> = {
  available: 0,
  in_progress: 1,
  completed: 2,
  expired: 3,
};

const groups = computed<ActivityGroup[]>(() => {
  const map = new Map<string, ActivityGroup>();
  for (const row of filteredRows.value) {
    if (!row.site) continue;
    const group = map.get(row.site.id) ?? {
      siteId: row.site.id,
      siteName: row.site.name,
      pointsName: row.site.pointsName,
      rows: [],
      completed: 0,
      types: [],
      lastSyncedAt: row.lastSyncedAt,
    };
    group.rows.push(row);
    if (row.status === 'completed') group.completed += 1;
    if (row.type && !group.types.includes(row.type)) group.types.push(row.type);
    if (row.lastSyncedAt > group.lastSyncedAt) group.lastSyncedAt = row.lastSyncedAt;
    map.set(row.site.id, group);
  }
  for (const group of map.values()) {
    group.rows.sort(
      (a, b) =>
        (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9) ||
        a.name.localeCompare(b.name, 'zh-CN'),
    );
  }
  return [...map.values()].sort((a, b) => a.siteName.localeCompare(b.siteName, 'zh-CN'));
});

const completed = computed(() => filteredRows.value.filter((row) => row.status === 'completed').length);

const accountForms = computed(() => selectedAccount.value?.accountForms ?? []);

const activeFields = computed(() => {
  const schema = activeActivity.value?.formSchema;
  return schema && Array.isArray(schema.fields) ? schema.fields : [];
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [accountList, activityList] = await Promise.all([
      api.get<AccountOverview[]>('/accounts/overview'),
      api.get<Activity[]>('/activities'),
    ]);
    accounts.value = accountList;
    rows.value = activityList;
    const preferred =
      (accountStore.selectedId && accountList.some((account) => account.id === accountStore.selectedId)
        ? accountStore.selectedId
        : '') ||
      (accountList.some((account) => account.id === selectedAccountId.value)
        ? selectedAccountId.value
        : '') ||
      accountList[0]?.id ||
      '';
    selectedAccountId.value = preferred;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

function statusLabel(status: string) {
  if (status === 'completed') return '已完成';
  if (status === 'available') return '可参与';
  if (status === 'in_progress') return '进行中';
  if (status === 'expired') return '已结束';
  return status;
}

function statusClass(status: string) {
  if (status === 'completed') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200';
  if (status === 'available' || status === 'in_progress') return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

function isGroupExpanded(siteId: string) {
  return expandedGroups.value.has(siteId);
}

function toggleGroup(siteId: string) {
  const next = new Set(expandedGroups.value);
  if (next.has(siteId)) next.delete(siteId);
  else next.add(siteId);
  expandedGroups.value = next;
}

function groupPage(siteId: string) {
  return groupPages.value[siteId] ?? 1;
}

function setGroupPage(siteId: string, page: number) {
  groupPages.value = { ...groupPages.value, [siteId]: page };
}

function groupPageRows(group: ActivityGroup) {
  const page = groupPage(group.siteId);
  return group.rows.slice((page - 1) * groupPageSize, page * groupPageSize);
}

function canParticipate(row: Activity) {
  return (
    Boolean(row.formSchema) &&
    Boolean(row.scriptId) &&
    row.status !== 'completed' &&
    row.status !== 'expired'
  );
}

function canManualParticipate(row: Activity) {
  return (
    !canParticipate(row) &&
    (row.status === 'available' || row.status === 'in_progress')
  );
}

function activityQrUrl(row: Activity): string {
  const metadata = (row.site?.metadata ?? {}) as Record<string, unknown>;
  const config = (row.site?.config ?? {}) as Record<string, unknown>;
  const candidates = [
    metadata.qrCodeUrl,
    metadata.qrcode,
    metadata.qr_code,
    config.qrCodeUrl,
    config.qrcode,
    config.qr_code,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return '';
}

function openManual(row: Activity) {
  manualActivity.value = row;
}

function progress(row: Activity) {
  if (row.progressTarget === null || row.progressTarget === undefined) return '—';
  return `${row.progressCurrent ?? 0} / ${row.progressTarget}`;
}

function formatTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('zh-CN');
}

function inputType(type?: string) {
  if (type === 'number') return 'number';
  if (type === 'tel') return 'tel';
  if (type === 'date') return 'date';
  return 'text';
}

function openParticipate(row: Activity) {
  activeActivity.value = row;
  formError.value = '';
  const values: Record<string, string> = {};
  const saved = selectedAccount.value?.accountForms ?? [];
  for (const field of row.formSchema?.fields ?? []) {
    const fromForm = saved
      .map((form) => {
        const match =
          form.template.fields.find((item) => item.key === field.key) ??
          form.template.fields.find((item) => item.label === field.label);
        return match ? form.values[match.key] : undefined;
      })
      .find((value) => value !== undefined && value !== '');
    values[field.key] = fromForm ?? field.defaultValue ?? '';
  }
  formValues.value = values;
}

function closeParticipate() {
  if (!submitting.value) activeActivity.value = null;
}

async function submitParticipate() {
  if (!activeActivity.value || !selectedAccount.value) return;
  formError.value = '';
  for (const field of activeFields.value) {
    if (field.required && !(formValues.value[field.key] ?? '').trim()) {
      formError.value = `请填写「${field.label}」`;
      return;
    }
  }
  submitting.value = true;
  try {
    const result = await api.post<{ run: Run }>(
      `/activities/${activeActivity.value.id}/participate`,
      {
        accountId: selectedAccount.value.id,
        values: formValues.value,
      },
    );
    message.value = `已提交「${activeActivity.value.name}」：${
      queueTicketText(result.run.queue) || `运行 ${result.run.id.slice(0, 8)}`
    }。`;
    lastRunId.value = result.run.id;
    activeActivity.value = null;
  } catch (e) {
    formError.value = e instanceof Error ? e.message : '提交失败';
  } finally {
    submitting.value = false;
  }
}

watch(
  () => accountStore.selectedId,
  (id) => {
    if (id && accounts.value.some((account) => account.id === id)) selectedAccountId.value = id;
  },
);

watch(selectedAccountId, () => {
  expandedGroups.value = new Set();
  groupPages.value = {};
});

onMounted(load);
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 class="flex items-center gap-2 text-lg font-semibold">
          <CalendarCheck class="h-5 w-5 text-brand-600" /> 活动 / 任务
        </h2>
        <p class="text-sm text-slate-500">按应用收纳活动；先选择账号，再查看该账号订阅应用的活动。</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <select v-model="selectedAccountId" class="input !w-auto !py-1.5 text-xs">
          <option v-for="account in accounts" :key="account.id" :value="account.id">{{ account.displayName }}</option>
        </select>
        <button class="btn-ghost !px-3 !py-1.5" :disabled="loading" @click="load">
          <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loading }" /> 刷新
        </button>
      </div>
    </div>

    <p v-if="error" class="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{{ error }}</p>
    <p v-if="message" class="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
      {{ message }}
      <RouterLink
        v-if="lastRunId"
        :to="{ path: '/runs', query: { run: lastRunId } }"
        class="ml-2 inline-flex font-medium underline"
      >
        查看实时日志
      </RouterLink>
    </p>

    <div v-if="accounts.length === 0" class="card flex flex-col items-center gap-3 py-10 text-center">
      <CalendarCheck class="h-8 w-8 text-slate-400" />
      <div class="text-sm font-medium">还没有微信账号</div>
      <p class="max-w-md text-sm text-slate-500">先到账号页同步账号，再回来查看活动。</p>
    </div>

    <template v-else>
      <div class="flex flex-wrap gap-2 text-xs text-slate-500">
        <span class="chip bg-slate-100 dark:bg-slate-800">账号：{{ selectedAccount?.displayName ?? '—' }}</span>
        <span class="chip bg-slate-100 dark:bg-slate-800">应用：{{ groups.length }}</span>
        <span class="chip bg-slate-100 dark:bg-slate-800">活动：{{ filteredRows.length }}</span>
        <span class="chip bg-slate-100 dark:bg-slate-800">已完成：{{ completed }}</span>
      </div>

      <div v-if="accountForms.length > 0" class="card space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div class="text-sm font-semibold">活动资料</div>
            <div class="text-xs text-slate-500">参加活动时会自动带入这里保存的字段值。</div>
          </div>
          <RouterLink :to="{ path: '/accounts', query: { forms: selectedAccountId } }" class="btn-ghost !px-3 !py-1.5">
            <FileText class="h-4 w-4" /> 编辑资料
          </RouterLink>
        </div>
        <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div v-for="form in accountForms" :key="form.id" class="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
            <div class="font-medium text-slate-700 dark:text-slate-200">{{ form.template.name }}</div>
            <div class="mt-1 space-y-0.5 text-slate-500">
              <div v-for="field in form.template.fields" :key="field.key">
                {{ field.label }}：{{ form.values[field.key] || '—' }}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="card flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
        <span>当前账号还没有填写活动资料（手机号、生日、地址等）。</span>
        <RouterLink :to="{ path: '/accounts', query: { forms: selectedAccountId } }" class="btn-ghost !px-3 !py-1.5">
          <FileText class="h-4 w-4" /> 去填写
        </RouterLink>
      </div>

      <div v-if="groups.length === 0" class="card flex flex-col items-center gap-3 py-10 text-center">
        <CalendarCheck class="h-8 w-8 text-slate-400" />
        <div class="text-sm font-medium">当前账号没有活动数据</div>
        <p class="max-w-md text-sm text-slate-500">运行一次签到/活动脚本后，活动会按应用出现在这里。</p>
      </div>

      <div v-else class="space-y-3">
        <div v-for="group in groups" :key="group.siteId" class="card">
          <button
            class="flex w-full flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 text-left dark:border-slate-800"
            type="button"
            :aria-expanded="isGroupExpanded(group.siteId)"
            @click="toggleGroup(group.siteId)"
          >
            <div class="flex flex-wrap items-center gap-2">
              <ChevronDown v-if="isGroupExpanded(group.siteId)" class="h-4 w-4 text-slate-400" />
              <ChevronRight v-else class="h-4 w-4 text-slate-400" />
              <span class="text-sm font-semibold">{{ group.siteName }}</span>
              <span class="chip bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-100">{{ group.pointsName }}</span>
              <span
                v-for="type in group.types"
                :key="type"
                class="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              >
                {{ type }}
              </span>
            </div>
            <div class="text-xs text-slate-500">
              {{ group.completed }} / {{ group.rows.length }} 已完成 · 同步 {{ formatTime(group.lastSyncedAt) }}
            </div>
          </button>

          <div v-show="isGroupExpanded(group.siteId)" class="space-y-1">
            <div class="divide-y divide-slate-100 dark:divide-slate-800">
            <div
              v-for="row in groupPageRows(group)"
              :key="row.id"
              class="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-1 last:pb-0"
            >
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="truncate text-sm font-medium">{{ row.name }}</span>
                  <span class="chip" :class="statusClass(row.status)">{{ statusLabel(row.status) }}</span>
                  <span v-if="row.points" class="chip bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-100">
                    +{{ row.points }}
                  </span>
                </div>
                <div class="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                  <span v-if="row.progressTarget !== null && row.progressTarget !== undefined">进度 {{ progress(row) }}</span>
                  <span v-if="row.startAt || row.endAt">{{ formatDate(row.startAt) }} ~ {{ formatDate(row.endAt) }}</span>
                  <span v-if="row.script">脚本：{{ row.script.name }}</span>
                  <span v-if="canManualParticipate(row)" class="text-amber-600 dark:text-amber-300">未解析参与接口，需手动参与</span>
                </div>
              </div>
              <button
                v-if="canParticipate(row)"
                class="btn-primary !px-3 !py-1 text-xs"
                :disabled="!selectedAccount"
                @click="openParticipate(row)"
              >
                <Send class="h-3.5 w-3.5" /> 参加
              </button>
              <button
                v-else-if="canManualParticipate(row)"
                class="btn-ghost !px-3 !py-1 text-xs"
                @click="openManual(row)"
              >
                <QrCode class="h-3.5 w-3.5" /> 手动参与
              </button>
            </div>
          </div>
          <Pagination
            :page="groupPage(group.siteId)"
            :total="group.rows.length"
            :page-size="groupPageSize"
            unit="个活动"
            @update:page="setGroupPage(group.siteId, $event)"
          />
        </div>
      </div>
      </div>
    </template>

    <!-- 参加活动表单弹窗 -->
    <div
      v-if="activeActivity"
      class="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4"
      @pointerdown.self="closeParticipate"
    >
      <div class="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-2xl">
        <div class="flex items-start justify-between gap-2 border-b border-slate-100 p-4 dark:border-slate-800">
          <div class="min-w-0">
            <div class="text-sm font-semibold">{{ activeActivity.formSchema?.title || '参加活动' }}</div>
            <div class="mt-1 text-xs text-slate-500">
              {{ activeActivity.name }}
              <span v-if="activeActivity.site"> · {{ activeActivity.site.name }}</span>
              <span v-if="selectedAccount"> · {{ selectedAccount.displayName }}</span>
            </div>
          </div>
          <button class="btn-ghost !px-2 !py-1.5" :disabled="submitting" @click="closeParticipate">
            <X class="h-4 w-4" />
          </button>
        </div>

        <div class="flex-1 space-y-3 overflow-auto p-4">
          <p v-if="activeActivity.formSchema?.description" class="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
            {{ activeActivity.formSchema.description }}
          </p>

          <div v-for="field in activeFields" :key="field.key" class="space-y-1">
            <label class="label !mb-0">
              {{ field.label }}
              <span v-if="field.required" class="text-red-500">*</span>
            </label>
            <select v-if="field.type === 'select'" v-model="formValues[field.key]" class="input">
              <option value="">请选择</option>
              <option v-for="option in field.options ?? []" :key="option" :value="option">{{ option }}</option>
            </select>
            <textarea
              v-else-if="field.type === 'textarea'"
              v-model="formValues[field.key]"
              class="input min-h-20"
              :placeholder="field.note || field.label"
            />
            <input
              v-else
              v-model="formValues[field.key]"
              class="input"
              :type="inputType(field.type)"
              :placeholder="field.note || field.label"
            />
            <p v-if="field.note" class="text-xs text-slate-500">{{ field.note }}</p>
          </div>

          <p v-if="activeFields.length === 0" class="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60">
            该活动无需填写额外信息，提交后会在后台运行。
          </p>

          <p v-if="formError" class="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
            {{ formError }}
          </p>
        </div>

        <div class="flex justify-end gap-2 border-t border-slate-100 p-4 dark:border-slate-800">
          <button class="btn-ghost" :disabled="submitting" @click="closeParticipate">取消</button>
          <button class="btn-primary" :disabled="submitting || !selectedAccount" @click="submitParticipate">
            <Send class="h-4 w-4" :class="{ 'animate-pulse': submitting }" />
            {{ submitting ? '提交中…' : activeActivity.formSchema?.submitText || '提交并参加' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 手动参与提示弹窗 -->
    <div
      v-if="manualActivity"
      class="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4"
      @pointerdown.self="manualActivity = null"
    >
      <div class="flex max-h-[92vh] w-full max-w-sm flex-col rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-2xl">
        <div class="flex items-start justify-between gap-2 border-b border-slate-100 p-4 dark:border-slate-800">
          <div class="min-w-0">
            <div class="text-sm font-semibold">手动参与 · {{ manualActivity.site?.name ?? '应用' }}</div>
            <div class="mt-1 text-xs text-slate-500">
              {{ manualActivity.name }}
              <span v-if="selectedAccount"> · {{ selectedAccount.displayName }}</span>
            </div>
          </div>
          <button class="btn-ghost !px-2 !py-1.5" @click="manualActivity = null">
            <X class="h-4 w-4" />
          </button>
        </div>

        <div class="flex-1 space-y-3 overflow-auto p-4">
          <p class="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
            该活动还没有解析出自动参与接口，请打开应用小程序手动完成。
          </p>

          <img
            v-if="activityQrUrl(manualActivity)"
            :src="activityQrUrl(manualActivity)"
            :alt="`${manualActivity.site?.name ?? '应用'}小程序码`"
            class="mx-auto max-h-[50vh] w-full rounded-xl object-contain"
          />
          <div
            v-else
            class="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500 dark:border-slate-700"
          >
            该应用还没有配置小程序码。可以到应用详情补充，或直接在微信中打开应用操作。
          </div>

          <p v-if="activityQrUrl(manualActivity)" class="text-center text-xs text-slate-500">
            微信扫码或长按识别小程序码
          </p>
        </div>

        <div class="flex justify-end gap-2 border-t border-slate-100 p-4 dark:border-slate-800">
          <RouterLink
            v-if="manualActivity.site"
            :to="`/sites/${manualActivity.site.id}`"
            class="btn-ghost !px-3 !py-1.5"
          >
            应用详情
          </RouterLink>
          <button class="btn-primary" @click="manualActivity = null">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>
