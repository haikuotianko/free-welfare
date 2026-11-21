<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  KeyRound,
  PlayCircle,
  Plus,
  QrCode,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Search,
  Settings,
  Trash2,
  UserPlus,
  X,
} from 'lucide-vue-next';
import {
  ApiError,
  api,
  type AccountOverview,
  type ActionFormField,
  type FormTemplate,
  type Run,
  type Site,
  type YybQrPoll,
  type YybQrSession,
} from '../lib/api';
import { accountStatusLabels, labelOf, runStatusLabels } from '../lib/labels';
import { runActionDetails } from '../lib/run-actions';
import { useAccountStore } from '../stores/account';
import { useClock } from '../stores/clock';
import ActionFormModal from '../components/ActionFormModal.vue';
import Pagination from '../components/Pagination.vue';

type SiteAccountItem = AccountOverview['siteAccounts'][number];
type AppFilter = 'all' | 'pending' | 'done' | 'failed' | 'disabled';

const APP_FILTERS: Array<{ key: AppFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待运行' },
  { key: 'done', label: '成功' },
  { key: 'failed', label: '失败' },
  { key: 'disabled', label: '禁用' },
];
const APP_PAGE_SIZE = 8;

const route = useRoute();
const accountStore = useAccountStore();
const clock = useClock();
const error = ref('');
const message = ref('');
const loading = ref(false);
const userFilter = ref(accountStore.selectedId);
const sites = ref<Site[]>([]);
const templates = ref<FormTemplate[]>([]);
const addSite = reactive<Record<string, string>>({});
const collapsed = reactive<Record<string, boolean>>({});

const runOpen = ref(false);
const runLoading = ref(false);
const runDetail = ref<Run | null>(null);
const runLogRef = ref<HTMLElement | null>(null);
const retrying = ref(false);
const registeringRunId = ref('');
const registrationModalOpen = ref(false);
const registrationRunId = ref('');
const registrationFields = ref<ActionFormField[]>([]);
const savingOffset = ref('');
const refreshingAccount = ref('');
const refreshingApp = ref('');
const togglingApp = ref('');
const envEditingApp = ref('');
const envSaving = ref(false);
const envDraft = ref<Array<{ key: string; value: string }>>([]);
const appFilterState = reactive<Record<string, AppFilter>>({});
const appPageState = reactive<Record<string, number>>({});
const appQueryState = reactive<Record<string, string>>({});

const qrOpen = ref(false);
const qrLoading = ref(false);
const qrDone = ref(false);
const qrImage = ref('');
const qrStatus = ref('');
const qrError = ref('');
const qrSessionId = ref('');
const qrPollBusy = ref(false);
const qrPolling = ref<ReturnType<typeof setInterval> | null>(null);

const formsOpen = ref(false);
const formsAccountId = ref('');
const formValues = reactive<Record<string, Record<string, string>>>({});
const addTemplateId = ref('');
const formsSaving = ref(false);

const visibleAccounts = computed(() =>
  userFilter.value
    ? accountStore.accounts.filter((account) => account.id === userFilter.value)
    : accountStore.accounts,
);

const formsAccount = computed(
  () => accountStore.accounts.find((account) => account.id === formsAccountId.value) ?? null,
);

const assignedTemplates = computed(() => formsAccount.value?.accountForms ?? []);

const availableTemplates = computed(() => {
  const assigned = new Set(assignedTemplates.value.map((item) => item.templateId));
  return templates.value.filter((template) => !assigned.has(template.id));
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [siteList, templateList] = await Promise.all([
      api.get<Site[]>('/sites'),
      api.get<FormTemplate[]>('/forms'),
    ]);
    sites.value = siteList;
    templates.value = templateList;
    await accountStore.load();
    if (userFilter.value && !accountStore.accounts.some((account) => account.id === userFilter.value)) {
      userFilter.value = '';
    }
    const formAccount = typeof route.query.forms === 'string' ? route.query.forms : '';
    if (formAccount && accountStore.accounts.some((account) => account.id === formAccount)) {
      openForms(accountStore.accounts.find((account) => account.id === formAccount)!);
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

async function sync() {
  loading.value = true;
  error.value = '';
  try {
    await api.post('/yyb/sync');
    accountStore.loaded = false;
    await accountStore.load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '同步失败';
  } finally {
    loading.value = false;
  }
}

function stopQrPolling() {
  if (qrPolling.value) {
    clearInterval(qrPolling.value);
    qrPolling.value = null;
  }
  qrPollBusy.value = false;
}

function closeQr() {
  qrOpen.value = false;
  stopQrPolling();
}

async function startQr() {
  stopQrPolling();
  qrOpen.value = true;
  qrDone.value = false;
  qrLoading.value = true;
  qrImage.value = '';
  qrSessionId.value = '';
  qrError.value = '';
  qrStatus.value = '正在创建二维码…';
  try {
    const session = await api.post<YybQrSession>('/yyb/qr');
    qrSessionId.value = session.sessionId;
    qrImage.value = session.image ?? '';
    qrStatus.value = '等待扫码';
    if (!session.image) qrError.value = 'YYB 没有返回二维码图片，请重试';
    qrPolling.value = setInterval(() => void pollQr(), 1500);
  } catch (e) {
    qrStatus.value = '创建失败';
    qrError.value = e instanceof Error ? e.message : '创建二维码失败';
  } finally {
    qrLoading.value = false;
  }
}

async function pollQr() {
  if (!qrSessionId.value || qrPollBusy.value || qrDone.value) return;
  qrPollBusy.value = true;
  try {
    const result = await api.get<YybQrPoll>(`/yyb/qr/${qrSessionId.value}`);
    if (result.status === 'pending') {
      qrStatus.value = '等待扫码';
    } else if (result.status === 'scanned') {
      qrStatus.value = '已扫码，请在手机上确认';
    } else if (result.status === 'authorized') {
      qrStatus.value = result.message ? `正在确认：${result.message}` : '已授权，正在保存账号…';
    } else if (result.status === 'confirmed') {
      qrDone.value = true;
      qrStatus.value = '账号已添加';
      stopQrPolling();
      message.value = '微信账号已添加';
      accountStore.loaded = false;
      await accountStore.load();
    } else if (result.status === 'expired') {
      qrStatus.value = '二维码已过期';
      stopQrPolling();
    } else if (result.status === 'cancelled') {
      qrStatus.value = '二维码已取消';
      stopQrPolling();
    } else {
      qrStatus.value = '等待扫码';
    }
  } catch (e) {
    qrError.value = e instanceof Error ? e.message : '查询扫码状态失败';
    stopQrPolling();
  } finally {
    qrPollBusy.value = false;
  }
}

async function refresh(account: AccountOverview) {
  if (refreshingAccount.value) return;
  refreshingAccount.value = account.id;
  error.value = '';
  message.value = '';
  try {
    await api.post(`/accounts/${account.id}/refresh`);
    message.value = `${account.displayName} 的账号状态已刷新`;
    accountStore.loaded = false;
    await accountStore.load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '刷新失败';
  } finally {
    refreshingAccount.value = '';
  }
}

async function saveOffset(account: AccountOverview, event: Event) {
  const input = event.target as HTMLInputElement;
  const value = Math.max(0, Math.min(1440, Math.trunc(Number(input.value) || 0)));
  savingOffset.value = account.id;
  error.value = '';
  message.value = '';
  try {
    await api.patch(`/accounts/${account.id}`, { timeOffsetMinutes: value });
    account.timeOffsetMinutes = value;
    input.value = String(value);
    message.value = `${account.displayName} 的执行偏移已设为 ${value} 分钟`;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存时间偏移失败';
    input.value = String(account.timeOffsetMinutes);
  } finally {
    savingOffset.value = '';
  }
}

function statusClass(status: string) {
  if (status === 'alive') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200';
  if (status === 'expired') return 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200';
  if (status === 'session_only') return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

function signInLabel(status: string) {
  if (status === 'done') return '今日已签到';
  if (status === 'pending') return '今日未签到';
  if (status === 'running') return '签到运行中';
  if (status === 'failed') return '签到失败';
  return '未运行';
}

function signInClass(status: string) {
  if (status === 'done') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200';
  if (status === 'failed') return 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200';
  if (status === 'running') return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

/** 该账号下一次签到时间 = 脚本计划时间 + 账号执行偏移。 */
function signInCountdown(siteAccount: SiteAccountItem, offsetMinutes: number) {
  const schedule = siteAccount.signIn.schedule;
  if (!schedule) return { text: '未设置定时', overdue: false, missing: true };
  if (!schedule.enabled) return { text: '定时已关闭', overdue: false, missing: true };
  if (!schedule.nextRunAt) return { text: '未设置定时', overdue: false, missing: true };
  const at = Date.parse(schedule.nextRunAt);
  if (!Number.isFinite(at)) return { text: '未设置定时', overdue: false, missing: true };
  const diff = at + (offsetMinutes || 0) * 60_000 - clock.current.value.getTime();
  if (diff <= 0) return { text: '时间已过', overdue: true, missing: false };
  const total = Math.floor(diff / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const timeText = `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  return {
    text: days > 0 ? `距签到 ${days}天 ${timeText}` : `距签到 ${timeText}`,
    overdue: false,
    missing: false,
  };
}

function formatTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function toggleCollapsed(accountId: string) {
  collapsed[accountId] = !collapsed[accountId];
}

function appFilterOf(accountId: string): AppFilter {
  return appFilterState[accountId] ?? 'all';
}

function appFilterLabel(filter: AppFilter) {
  return APP_FILTERS.find((item) => item.key === filter)?.label ?? '全部';
}

function appCategory(item: SiteAccountItem): Exclude<AppFilter, 'all'> {
  if (item.disabled) return 'disabled';
  if (item.signIn.status === 'done') return 'done';
  if (item.signIn.status === 'failed') return 'failed';
  return 'pending';
}

function appQueryOf(accountId: string): string {
  return appQueryState[accountId] ?? '';
}

function appsMatchingSearch(account: AccountOverview) {
  const query = appQueryOf(account.id).trim().toLowerCase();
  if (!query) return account.siteAccounts;
  return account.siteAccounts.filter((item) => {
    const site = item.site;
    return [site.name, site.key, site.appId, site.pointsName]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function filteredApps(account: AccountOverview) {
  const filter = appFilterOf(account.id);
  const apps = appsMatchingSearch(account);
  if (filter === 'all') return apps;
  return apps.filter((item) => appCategory(item) === filter);
}

function pagedApps(account: AccountOverview) {
  const page = appPageOf(account);
  return filteredApps(account).slice((page - 1) * APP_PAGE_SIZE, page * APP_PAGE_SIZE);
}

function appCount(account: AccountOverview, filter: AppFilter) {
  const apps = appsMatchingSearch(account);
  if (filter === 'all') return apps.length;
  return apps.filter((item) => appCategory(item) === filter).length;
}

function appPageOf(account: AccountOverview) {
  const totalPages = Math.max(1, Math.ceil(filteredApps(account).length / APP_PAGE_SIZE));
  return Math.min(appPageState[account.id] ?? 1, totalPages);
}

function setAppFilter(accountId: string, filter: AppFilter) {
  appFilterState[accountId] = filter;
  appPageState[accountId] = 1;
}

function setAppQuery(accountId: string, value: string) {
  appQueryState[accountId] = value;
  appPageState[accountId] = 1;
}

function setAppQueryFromEvent(accountId: string, event: Event) {
  setAppQuery(accountId, (event.target as HTMLInputElement).value);
}

function setAppPage(accountId: string, page: number) {
  appPageState[accountId] = page;
}

function appEnvCount(siteAccount: SiteAccountItem) {
  return Object.keys(siteAccount.envVars || {}).length;
}

function appEnvRows(siteAccount: SiteAccountItem) {
  return Object.entries(siteAccount.envVars || {}).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : String(value),
  }));
}

function toggleAppEnv(siteAccount: SiteAccountItem) {
  error.value = '';
  message.value = '';
  if (envEditingApp.value === siteAccount.id) {
    envEditingApp.value = '';
    envDraft.value = [];
    return;
  }
  envEditingApp.value = siteAccount.id;
  envDraft.value = appEnvRows(siteAccount);
  if (envDraft.value.length === 0) envDraft.value = [{ key: '', value: '' }];
}

function addEnvRow() {
  envDraft.value.push({ key: '', value: '' });
}

function removeEnvRow(index: number) {
  envDraft.value.splice(index, 1);
  if (envDraft.value.length === 0) envDraft.value = [{ key: '', value: '' }];
}

function clearEnvDraft() {
  envDraft.value = [{ key: '', value: '' }];
}

async function saveAppEnv(siteAccount: SiteAccountItem) {
  if (envSaving.value) return;
  const envVars: Record<string, string> = {};
  for (const row of envDraft.value) {
    const key = row.key.trim();
    if (key) envVars[key] = row.value;
  }
  envSaving.value = true;
  error.value = '';
  message.value = '';
  try {
    await api.patch(`/sites/${siteAccount.siteId}/accounts/${siteAccount.id}`, { envVars });
    siteAccount.envVars = envVars;
    envEditingApp.value = '';
    envDraft.value = [];
    message.value = `已保存「${siteAccount.site.name}」的账号环境变量`;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存账号环境变量失败';
  } finally {
    envSaving.value = false;
  }
}

function formFieldOptions(account: AccountOverview) {
  const options: Array<{ value: string; label: string }> = [];
  for (const form of account.accountForms) {
    for (const field of form.template?.fields ?? []) {
      if (!field.key) continue;
      options.push({
        value: `{{form.${form.templateId}.${field.key}}}`,
        label: `${form.template?.name ?? '表单'} / ${field.label || field.key}`,
      });
    }
  }
  return options;
}

const FORM_VALUE_PATTERN = /^\{\{form\.([^.}]+)\.([^}]+)\}\}$/;

function formFieldLabel(account: AccountOverview, value: string) {
  const match = FORM_VALUE_PATTERN.exec(String(value || '').trim());
  if (!match) return '';
  const [, templateId, fieldKey] = match;
  for (const form of account.accountForms) {
    if (form.templateId !== templateId) continue;
    const field = (form.template?.fields ?? []).find((item) => item.key === fieldKey);
    if (field) return `${form.template?.name ?? '表单'} / ${field.label || field.key}`;
  }
  return '已失效的表单配置项';
}

function applyFormField(row: { value: string }, event: Event) {
  const select = event.target as HTMLSelectElement;
  if (select.value) row.value = select.value;
  select.value = '';
}

async function refreshApp(siteAccount: SiteAccountItem) {
  if (refreshingApp.value) return;
  refreshingApp.value = siteAccount.id;
  error.value = '';
  message.value = '';
  try {
    const run = await api.post<Run>(
      `/sites/${siteAccount.siteId}/accounts/${siteAccount.id}/refresh`,
    );
    if (run.queue && run.queue.position > 0) {
      message.value = `「${siteAccount.site.name}」已排队，前面还有 ${run.queue.ahead} 个任务`;
    } else {
      message.value = `正在刷新「${siteAccount.site.name}」状态…`;
    }
    if (['queued', 'starting', 'running'].includes(run.status)) {
      await waitForRun(run.id, siteAccount.site.name);
    } else if (['failed', 'timeout'].includes(run.status)) {
      message.value = '';
      error.value = run.errorMessage || `「${siteAccount.site.name}」刷新失败`;
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '刷新失败';
  } finally {
    refreshingApp.value = '';
    await accountStore.load();
  }
}

async function waitForRun(runId: string, siteName: string) {
  const deadline = Date.now() + 4 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const run = await api.get<Run>(`/runs/${runId}`);
    if (!['starting', 'queued', 'running'].includes(run.status)) {
      if (run.status === 'succeeded') {
        message.value = `「${siteName}」状态已刷新`;
      } else {
        message.value = '';
        error.value = run.errorMessage || `「${siteName}」刷新失败`;
      }
      return;
    }
  }
  message.value = `「${siteName}」仍在排队，完成后再看状态即可`;
}

async function toggleAppDisabled(siteAccount: SiteAccountItem) {
  if (togglingApp.value) return;
  const next = !siteAccount.disabled;
  if (
    next &&
    !window.confirm(
      `禁用「${siteAccount.site.name}」？禁用后该账号不会自动运行这个应用，手动刷新仍可使用。`,
    )
  ) {
    return;
  }
  togglingApp.value = siteAccount.id;
  error.value = '';
  message.value = '';
  try {
    await api.patch(`/sites/${siteAccount.siteId}/accounts/${siteAccount.id}`, {
      disabled: next,
    });
    siteAccount.disabled = next;
    message.value = next
      ? `已禁用「${siteAccount.site.name}」的自动运行`
      : `已启用「${siteAccount.site.name}」的自动运行`;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '更新禁用状态失败';
  } finally {
    togglingApp.value = '';
  }
}

function availableSites(account: AccountOverview) {
  const bound = new Set(account.siteAccounts.map((item) => item.siteId));
  return sites.value.filter((site) => !bound.has(site.id));
}

async function subscribe(account: AccountOverview) {
  const siteId = addSite[account.id];
  if (!siteId) return;
  error.value = '';
  message.value = '';
  try {
    await api.post(`/sites/${siteId}/accounts`, { wechatAccountId: account.id });
    addSite[account.id] = '';
    await accountStore.load();
    message.value = '已添加订阅';
  } catch (e) {
    error.value = e instanceof Error ? e.message : '添加订阅失败';
  }
}

async function unsubscribe(account: AccountOverview, siteId: string, siteName: string) {
  const siteAccount = account.siteAccounts.find((item) => item.siteId === siteId);
  if (!siteAccount) return;
  if (!window.confirm(`取消订阅「${siteName}」？不会删除应用，只会解绑这个账号。`)) return;
  error.value = '';
  message.value = '';
  try {
    await api.del(`/sites/${siteId}/accounts/${siteAccount.id}`);
    await accountStore.load();
    message.value = '已取消订阅';
  } catch (e) {
    error.value = e instanceof Error ? e.message : '取消订阅失败';
  }
}

async function scrollRunLogs() {
  await nextTick();
  const element = runLogRef.value;
  if (element) element.scrollTop = element.scrollHeight;
}

function emptyLogText(status?: string) {
  if (status === 'queued') return '排队中，轮到后会开始输出日志…';
  if (status === 'starting') return '正在启动，脚本开始后输出日志…';
  if (status === 'running') return '脚本运行中，等待输出…';
  return '暂无日志';
}

async function openRun(runId?: string | null) {
  if (!runId) return;
  runLoading.value = true;
  runOpen.value = true;
  runDetail.value = null;
  try {
    const initial = await api.get<Run>(`/runs/${runId}`);
    runDetail.value = initial;
    runLoading.value = false;
    await scrollRunLogs();
    let current = initial;
    while (['starting', 'queued', 'running'].includes(current.status)) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      if (!runOpen.value || runDetail.value?.id !== runId) break;
      current = await api.get<Run>(`/runs/${runId}`);
      runDetail.value = current;
      await scrollRunLogs();
    }
    if (!['starting', 'queued', 'running'].includes(current.status)) await accountStore.load();
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.code === 'run_not_found')) {
      runDetail.value = null;
      runOpen.value = false;
      await accountStore.load();
      return;
    }
    error.value = e instanceof Error ? e.message : '加载日志失败';
    runOpen.value = false;
  } finally {
    runLoading.value = false;
  }
}

async function retryRun() {
  if (!runDetail.value) return;
  retrying.value = true;
  error.value = '';
  message.value = '';
  try {
    const created = await api.post<Run>(`/runs/${runDetail.value.id}/retry`);
    runOpen.value = true;
    runDetail.value = created;
    await scrollRunLogs();
    let result = created;
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      result = await api.get<Run>(`/runs/${created.id}`);
      runDetail.value = result;
      await scrollRunLogs();
      if (!['starting', 'queued', 'running'].includes(result.status)) break;
    }
    runDetail.value = await api.get<Run>(`/runs/${created.id}`);
    await accountStore.load();
    if (result.status === 'succeeded') {
      message.value = '重试成功，账号状态已更新';
    } else {
      error.value = result.errorMessage || '重试失败';
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '重试失败';
  } finally {
    retrying.value = false;
  }
}

async function registerRun(runId?: string | null) {
  if (!runId) return;
  error.value = '';
  message.value = '';
  try {
    const run = await api.get<Run>(`/runs/${runId}`);
    const details = runActionDetails(run);
    if (details.fields.length > 0) {
      registrationRunId.value = runId;
      registrationFields.value = details.fields;
      registrationModalOpen.value = true;
      return;
    }
    await submitRegister(runId);
  } catch (e) {
    error.value = e instanceof Error ? e.message : '读取注册表单失败';
  }
}

async function submitRegister(runId: string, input?: Record<string, string>) {
  registeringRunId.value = runId;
  error.value = '';
  message.value = '';
  try {
    const body = input && Object.keys(input).length > 0 ? { action: 'register', input } : { action: 'register' };
    const created = await api.post<Run>(`/runs/${runId}/action`, body);
    runOpen.value = true;
    runDetail.value = created;
    await scrollRunLogs();
    let result = created;
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      result = await api.get<Run>(`/runs/${created.id}`);
      runDetail.value = result;
      await scrollRunLogs();
      if (!['starting', 'queued', 'running'].includes(result.status)) break;
    }
    await accountStore.load();
    if (result.status === 'succeeded') {
      message.value = '一键注册完成，账号状态已更新';
    } else {
      error.value = result.errorMessage || '一键注册失败';
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '一键注册失败';
  } finally {
    registeringRunId.value = '';
  }
}

async function submitRegistrationForm(values: Record<string, string>) {
  const runId = registrationRunId.value;
  registrationModalOpen.value = false;
  if (runId) await submitRegister(runId, values);
}

function openForms(account: AccountOverview) {
  formsAccountId.value = account.id;
  formsOpen.value = true;
  error.value = '';
  message.value = '';
  addTemplateId.value = '';
  for (const key of Object.keys(formValues)) delete formValues[key];
  for (const form of account.accountForms) {
    formValues[form.templateId] = { ...form.values };
  }
}

function refreshFormValues(account: AccountOverview) {
  for (const key of Object.keys(formValues)) delete formValues[key];
  for (const form of account.accountForms) {
    formValues[form.templateId] = { ...form.values };
  }
}

async function saveForm(templateId: string) {
  if (!formsAccount.value) return;
  formsSaving.value = true;
  error.value = '';
  message.value = '';
  try {
    await api.put(`/accounts/${formsAccount.value.id}/forms/${templateId}`, {
      values: formValues[templateId] || {},
    });
    await accountStore.load();
    const latest = accountStore.accounts.find((item) => item.id === formsAccountId.value);
    if (latest) refreshFormValues(latest);
    message.value = '表单资料已保存';
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败';
  } finally {
    formsSaving.value = false;
  }
}

async function addForm() {
  if (!formsAccount.value || !addTemplateId.value) return;
  formsSaving.value = true;
  error.value = '';
  message.value = '';
  try {
    await api.put(`/accounts/${formsAccount.value.id}/forms/${addTemplateId.value}`, {
      values: {},
    });
    addTemplateId.value = '';
    await accountStore.load();
    const latest = accountStore.accounts.find((item) => item.id === formsAccountId.value);
    if (latest) refreshFormValues(latest);
    message.value = '已添加表单';
  } catch (e) {
    error.value = e instanceof Error ? e.message : '添加表单失败';
  } finally {
    formsSaving.value = false;
  }
}

async function removeForm(templateId: string, name: string) {
  if (!formsAccount.value) return;
  if (!window.confirm(`删除「${name}」的填写数据？`)) return;
  formsSaving.value = true;
  error.value = '';
  message.value = '';
  try {
    await api.del(`/accounts/${formsAccount.value.id}/forms/${templateId}`);
    await accountStore.load();
    const latest = accountStore.accounts.find((item) => item.id === formsAccountId.value);
    if (latest) refreshFormValues(latest);
    message.value = '已删除表单数据';
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除失败';
  } finally {
    formsSaving.value = false;
  }
}

onMounted(load);

let accountsRefreshTimer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  // 定时刷新账号概览，让签到倒计时和运行状态不会一直停留在旧数据。
  accountsRefreshTimer = setInterval(() => {
    if (!document.hidden && !loading.value) void accountStore.load();
  }, 60_000);
});

onUnmounted(() => {
  stopQrPolling();
  if (accountsRefreshTimer) clearInterval(accountsRefreshTimer);
  accountsRefreshTimer = null;
});
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 class="text-lg font-semibold">微信账号</h2>
        <p class="text-sm text-slate-500">每个账号对应的应用、积分、签到状态、订阅和配置（执行偏移、表单资料、账号环境变量）。</p>
        <p v-if="accountStore.selectedAccount" class="mt-1 text-xs text-brand-600 dark:text-brand-300">
          全局当前账号：{{ accountStore.selectedAccount.displayName }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <select v-model="userFilter" class="input !w-auto !py-1.5 text-xs">
          <option value="">全部用户</option>
          <option v-for="account in accountStore.accounts" :key="account.id" :value="account.id">
            {{ account.displayName }}
          </option>
        </select>
        <RouterLink to="/forms" class="btn-ghost !px-3 !py-1.5">表单配置</RouterLink>
        <button class="btn-ghost !px-3 !py-1.5" :disabled="qrLoading" @click="startQr">
          <QrCode class="h-4 w-4" /> 扫码添加账号
        </button>
        <button class="btn-primary" :disabled="loading" @click="sync">
          <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loading }" />
          同步账号
        </button>
      </div>
    </div>

    <p v-if="error" class="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{{ error }}</p>
    <p v-if="message" class="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">{{ message }}</p>

    <div v-if="accountStore.accounts.length === 0" class="card flex flex-col items-center gap-3 py-10 text-center">
      <ScanLine class="h-8 w-8 text-slate-400" />
      <div class="text-sm font-medium">还没有账号</div>
      <p class="max-w-md text-sm text-slate-500">
        点击上方“扫码添加账号”，用手机微信扫码确认；添加后会自动同步账号。
      </p>
    </div>

    <div v-else class="space-y-4">
      <div
        v-for="account in visibleAccounts"
        :key="account.id"
        class="card space-y-3"
        :class="accountStore.selectedId === account.id ? 'ring-2 ring-brand-400 dark:ring-brand-700' : ''"
      >
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="truncate font-medium">{{ account.displayName }}</span>
              <span v-if="account.status === 'alive'" class="chip" :class="statusClass(account.status)">
                {{ labelOf(accountStatusLabels, account.status) }}
              </span>
              <button
                v-else
                type="button"
                class="chip cursor-pointer transition hover:opacity-80"
                :class="statusClass(account.status)"
                :disabled="refreshingAccount === account.id"
                title="账号当前不可用，点击刷新状态"
                @click="refresh(account)"
              >
                <RefreshCw class="mr-1 h-3 w-3" :class="{ 'animate-spin': refreshingAccount === account.id }" />
                {{ labelOf(accountStatusLabels, account.status) }}
              </button>
              <span v-if="accountStore.selectedId === account.id" class="chip bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-100">
                <CheckCircle2 class="mr-1 h-3 w-3" /> 当前账号
              </span>
            </div>
            <div class="mt-1 text-xs text-slate-500">
              YYB #{{ account.yybRef }} · {{ account.scanProduct ?? '未知渠道' }} · OpenID：{{ account.openidMasked ?? '—' }}
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              v-if="accountStore.selectedId !== account.id"
              class="btn-ghost !px-3 !py-1.5"
              @click="accountStore.select(account.id)"
            >
              设为当前
            </button>
            <button class="btn-ghost !px-3 !py-1.5" @click="toggleCollapsed(account.id)">
              <ChevronUp v-if="!collapsed[account.id]" class="h-4 w-4" />
              <ChevronDown v-else class="h-4 w-4" />
              {{ collapsed[account.id] ? '展开应用' : '收起应用' }}
            </button>
            <button
              class="btn-ghost !px-3 !py-1.5"
              title="账号配置、执行偏移和表单资料"
              @click="openForms(account)"
            >
              <Settings class="h-4 w-4" /> 配置
            </button>
          </div>
        </div>

        <div v-show="!collapsed[account.id]" class="space-y-3">
          <div v-if="account.siteAccounts.length === 0" class="rounded-xl border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700">
            未订阅应用。可以在下面添加订阅，或到应用详情绑定。
          </div>
          <div v-else class="space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <div class="relative min-w-56 flex-1 sm:max-w-xs">
              <Search class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                :value="appQueryOf(account.id)"
                type="text"
                class="input !py-1.5 !pl-8 !pr-8 text-xs"
                placeholder="搜索应用名称、key、AppID"
                @input="setAppQueryFromEvent(account.id, $event)"
              />
              <button
                v-if="appQueryOf(account.id)"
                type="button"
                class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
                title="清空搜索"
                @click="setAppQuery(account.id, '')"
              >
                <X class="h-3.5 w-3.5" />
              </button>
            </div>
            <span class="text-[11px] text-slate-400">
              显示 {{ pagedApps(account).length }} / {{ filteredApps(account).length }}
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-1.5">
            <button
              v-for="tab in APP_FILTERS"
              :key="tab.key"
              type="button"
              class="rounded-full border px-2.5 py-1 text-[11px] transition"
              :class="
                appFilterOf(account.id) === tab.key
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              "
              @click="setAppFilter(account.id, tab.key)"
            >
              {{ tab.label }}
              <span class="ml-0.5 opacity-80">{{ appCount(account, tab.key) }}</span>
            </button>
          </div>

          <div
            v-if="filteredApps(account).length === 0"
            class="rounded-xl border border-dashed border-slate-300 p-3 text-center text-xs text-slate-500 dark:border-slate-700"
          >
            <template v-if="appQueryOf(account.id).trim()">
              没有匹配「{{ appQueryOf(account.id).trim() }}」的应用
              <button class="ml-1 text-brand-600 hover:underline dark:text-brand-300" @click="setAppQuery(account.id, '')">
                清除搜索
              </button>
            </template>
            <template v-else>
              没有「{{ appFilterLabel(appFilterOf(account.id)) }}」状态的应用
            </template>
          </div>

          <div
            v-for="siteAccount in pagedApps(account)"
            :key="siteAccount.id"
            class="rounded-xl border border-slate-200 p-3 transition dark:border-slate-800"
            :class="siteAccount.disabled ? 'opacity-75' : ''"
          >
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div class="min-w-0 sm:flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <RouterLink :to="`/sites/${siteAccount.site.id}`" class="font-medium hover:underline">
                    {{ siteAccount.site.name }}
                  </RouterLink>
                  <button
                    class="chip transition hover:opacity-80"
                    :class="signInClass(siteAccount.signIn.status)"
                    :disabled="!siteAccount.signIn.runId"
                    :title="siteAccount.signIn.runId ? '查看运行日志' : '暂无运行记录'"
                    @click="openRun(siteAccount.signIn.runId)"
                  >
                    {{ signInLabel(siteAccount.signIn.status) }}
                  </button>
                  <button
                    v-if="siteAccount.signIn.action === 'register' && siteAccount.signIn.runId"
                    class="chip bg-brand-50 text-brand-700 transition hover:opacity-80 disabled:opacity-50 dark:bg-brand-900/30 dark:text-brand-100"
                    :disabled="registeringRunId === siteAccount.signIn.runId"
                    @click="registerRun(siteAccount.signIn.runId)"
                  >
                    <UserPlus class="mr-1 h-3 w-3" />
                    {{ registeringRunId === siteAccount.signIn.runId ? '注册中…' : '一键注册' }}
                  </button>
                  <span
                    v-if="siteAccount.disabled"
                    class="chip bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200"
                  >
                    已禁用自动运行
                  </span>
                  <span
                    v-if="appEnvCount(siteAccount) > 0"
                    class="chip bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-100"
                    :title="'当前账号已配置 ' + appEnvCount(siteAccount) + ' 个环境变量'"
                  >
                    账号变量 {{ appEnvCount(siteAccount) }}
                  </span>
                </div>
                <div class="mt-1 flex min-w-0 items-baseline gap-1 text-xs text-slate-500">
                  <span class="shrink-0">签到记录：{{ formatTime(siteAccount.signIn.at) }}</span>
                  <span
                    v-if="siteAccount.signIn.message"
                    class="min-w-0 line-clamp-2 break-words sm:line-clamp-1"
                    :title="siteAccount.signIn.message"
                  >
                    · {{ siteAccount.signIn.message }}
                  </span>
                </div>
                <div
                  v-if="['pending', 'unknown'].includes(siteAccount.signIn.status)"
                  class="mt-1 flex flex-wrap items-center gap-2 text-xs"
                >
                  <span
                    :class="signInCountdown(siteAccount, account.timeOffsetMinutes).overdue
                      ? 'font-medium text-amber-600 dark:text-amber-300'
                      : 'text-slate-500'"
                  >
                    {{ signInCountdown(siteAccount, account.timeOffsetMinutes).text }}
                  </span>
                  <RouterLink
                    :to="`/sites/${siteAccount.site.id}`"
                    class="text-brand-600 hover:underline dark:text-brand-300"
                  >
                    详情
                  </RouterLink>
                </div>
              </div>
              <div class="flex items-center justify-between gap-2 sm:shrink-0 sm:justify-end sm:flex-nowrap sm:text-right">
                <div class="min-w-16 text-left sm:text-right">
                  <div class="text-xl font-semibold">{{ siteAccount.pointAccount?.balance ?? '—' }}</div>
                  <div class="text-xs text-slate-500">
                    {{ siteAccount.site.pointsName }}
                    <span v-if="siteAccount.pointAccount?.expiringAmount"> · 即将过期 {{ siteAccount.pointAccount.expiringAmount }}</span>
                  </div>
                </div>
                <div class="flex items-center gap-1">
                  <button
                    class="btn-ghost !px-2 !py-1 text-xs"
                    :class="envEditingApp === siteAccount.id ? 'text-brand-600 dark:text-brand-300' : ''"
                    title="配置当前账号在这个应用里的环境变量，覆盖应用默认值"
                    aria-label="配置账号环境变量"
                    @click="toggleAppEnv(siteAccount)"
                  >
                    <KeyRound class="h-3.5 w-3.5" />
                    <span class="hidden sm:inline">环境变量</span>
                  </button>
                  <button
                    class="btn-ghost !px-2 !py-1 text-xs"
                    :disabled="refreshingApp === siteAccount.id"
                    title="立即执行该应用的签到脚本并刷新状态"
                    aria-label="刷新应用状态"
                    @click="refreshApp(siteAccount)"
                  >
                    <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': refreshingApp === siteAccount.id }" />
                    <span class="hidden sm:inline">{{ refreshingApp === siteAccount.id ? '刷新中' : '刷新状态' }}</span>
                  </button>
                  <button
                    class="btn-ghost !px-2 !py-1 text-xs"
                    :class="siteAccount.disabled ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-300'"
                    :disabled="togglingApp === siteAccount.id"
                    :title="siteAccount.disabled ? '恢复自动运行' : '停止这个应用的自动运行，手动刷新仍可使用'"
                    aria-label="切换应用自动运行"
                    @click="toggleAppDisabled(siteAccount)"
                  >
                    <PlayCircle v-if="siteAccount.disabled" class="h-3.5 w-3.5" />
                    <Ban v-else class="h-3.5 w-3.5" />
                    <span class="hidden sm:inline">{{ siteAccount.disabled ? '启用' : '禁用' }}</span>
                  </button>
                  <button
                    class="btn-ghost !px-2 !py-1 text-xs text-red-600 dark:text-red-300"
                    title="取消订阅"
                    aria-label="取消订阅应用"
                    @click="unsubscribe(account, siteAccount.siteId, siteAccount.site.name)"
                  >
                    <Trash2 class="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            <div
              v-if="envEditingApp === siteAccount.id"
              class="mt-3 space-y-2 rounded-xl border border-brand-200 bg-brand-50/40 p-3 dark:border-brand-800/60 dark:bg-brand-900/20"
            >
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div class="text-xs font-medium">账号环境变量</div>
                  <p class="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    仅对当前账号生效，优先于应用默认环境变量；留空或删除后使用默认值。值也可以选择当前账号的表单配置项，运行时自动取值。
                  </p>
                </div>
                <div class="flex gap-2">
                  <button type="button" class="btn-ghost !px-2 !py-1 text-[11px]" @click="addEnvRow">
                    <Plus class="h-3.5 w-3.5" /> 添加
                  </button>
                  <button type="button" class="btn-ghost !px-2 !py-1 text-[11px]" @click="clearEnvDraft">
                    清空
                  </button>
                </div>
              </div>
              <div class="space-y-2">
                <div v-for="(row, index) in envDraft" :key="index" class="flex flex-wrap items-start gap-2">
                  <input v-model="row.key" class="input font-mono text-xs sm:w-56" placeholder="KEY，如 MXBC_ACCESS_TOKEN" />
                  <input v-model="row.value" class="input min-w-48 flex-1 font-mono text-xs" placeholder="值；留空使用应用默认值" />
                  <select
                    v-if="formFieldOptions(account).length"
                    class="input !w-auto max-w-48 !py-1.5 text-xs"
                    title="选择当前账号的表单配置项作为值，运行时自动取值"
                    @change="applyFormField(row, $event)"
                  >
                    <option value="">选择表单项</option>
                    <option v-for="option in formFieldOptions(account)" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                  <button
                    type="button"
                    class="btn-ghost !px-2 !py-1.5 text-red-600 dark:text-red-300"
                    title="删除这一行"
                    @click="removeEnvRow(index)"
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                  </button>
                  <p v-if="formFieldLabel(account, row.value)" class="w-full text-[11px] text-slate-500 dark:text-slate-400">
                    表单：{{ formFieldLabel(account, row.value) }}（运行时自动取值）
                  </p>
                </div>
              </div>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="text-[11px] text-slate-500 dark:text-slate-400">保存后立即用于该账号的脚本运行</span>
                <div class="flex gap-2">
                  <button type="button" class="btn-ghost !px-3 !py-1.5 text-xs" @click="toggleAppEnv(siteAccount)">
                    取消
                  </button>
                  <button
                    type="button"
                    class="btn-primary !px-3 !py-1.5 text-xs"
                    :disabled="envSaving"
                    @click="saveAppEnv(siteAccount)"
                  >
                    {{ envSaving ? '保存中…' : '保存变量' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <Pagination
            :page="appPageOf(account)"
            :total="filteredApps(account).length"
            :page-size="APP_PAGE_SIZE"
            unit="个应用"
            @update:page="setAppPage(account.id, $event)"
          />
          </div>

          <div class="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <div class="min-w-48 flex-1">
              <label class="label">添加订阅应用</label>
              <select v-model="addSite[account.id]" class="input">
                <option value="">选择应用</option>
                <option v-for="site in availableSites(account)" :key="site.id" :value="site.id">
                  {{ site.name }}
                </option>
              </select>
            </div>
            <button class="btn-primary !px-3 !py-1.5" :disabled="!addSite[account.id]" @click="subscribe(account)">
              <Plus class="h-4 w-4" /> 订阅
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- YYB 扫码添加账号弹窗 -->
    <div
      v-if="qrOpen"
      class="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4"
      @pointerdown.self="closeQr"
    >
      <div class="flex max-h-[92vh] w-full max-w-sm flex-col rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-2xl">
        <div class="flex items-start justify-between gap-2 border-b border-slate-100 p-4 dark:border-slate-800">
          <div>
            <div class="text-sm font-semibold">扫码添加微信账号</div>
            <div class="mt-1 text-xs text-slate-500">使用手机微信扫码，确认后账号会自动加入 YYB 并同步。</div>
          </div>
          <button class="btn-ghost !px-2 !py-1.5" @click="closeQr">
            <X class="h-4 w-4" />
          </button>
        </div>

        <div class="flex-1 space-y-3 overflow-auto p-4">
          <div v-if="qrLoading" class="py-10 text-center text-sm text-slate-500">正在创建二维码…</div>
          <template v-else>
            <div v-if="qrImage" class="mx-auto w-full max-w-[280px] overflow-hidden rounded-2xl bg-white p-2 ring-1 ring-slate-200 dark:ring-slate-700">
              <img :src="qrImage" alt="YYB 扫码添加账号二维码" class="h-auto w-full" />
            </div>
            <div v-else class="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
              二维码加载失败
            </div>

            <div class="flex items-center justify-center gap-2 text-sm">
              <CheckCircle2 v-if="qrDone" class="h-4 w-4 text-emerald-500" />
              <span :class="qrDone ? 'text-emerald-600 dark:text-emerald-300' : ''">{{ qrStatus }}</span>
            </div>
            <p v-if="qrError" class="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-200">
              {{ qrError }}
            </p>
            <p v-if="!qrDone" class="text-center text-xs text-slate-500">
              二维码约 110 秒有效；过期或无法识别时点击“刷新二维码”。
            </p>
          </template>
        </div>

        <div class="flex justify-end gap-2 border-t border-slate-100 p-4 dark:border-slate-800">
          <button v-if="!qrDone" class="btn-ghost" :disabled="qrLoading" @click="startQr">刷新二维码</button>
          <button class="btn-primary" @click="closeQr">{{ qrDone ? '完成' : '关闭' }}</button>
        </div>
      </div>
    </div>

    <!-- 运行日志弹窗 -->
    <div v-if="runOpen" class="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4" @pointerdown.self="runOpen = false">
      <div class="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-2xl">
        <div class="flex items-start justify-between gap-2 border-b border-slate-100 p-4 dark:border-slate-800">
          <div class="min-w-0">
            <div class="text-sm font-semibold">运行日志</div>
            <div v-if="runDetail" class="mt-1 text-xs text-slate-500">
              {{ runDetail.site?.name ?? '应用' }} ·
              {{ runDetail.siteScript?.name ?? '任务' }}
              <span v-if="runDetail.siteAccount?.wechatAccount?.displayName"> · {{ runDetail.siteAccount.wechatAccount.displayName }}</span>
            </div>
          </div>
          <button class="btn-ghost !px-2 !py-1.5" @click="runOpen = false">
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="flex-1 overflow-auto p-4">
          <div v-if="runLoading" class="py-8 text-center text-sm text-slate-500">加载中…</div>
          <template v-else-if="runDetail">
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div class="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60">状态：{{ labelOf(runStatusLabels, runDetail.status) }}</div>
              <div class="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60">耗时：{{ runDetail.durationMs ?? '—' }}ms</div>
              <div class="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60">开始：{{ formatTime(runDetail.startedAt) }}</div>
              <div class="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60">错误码：{{ runDetail.errorCode ?? '—' }}</div>
            </div>
            <p v-if="runDetail.errorMessage" class="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
              {{ runDetail.errorMessage }}
            </p>
            <div ref="runLogRef" class="mt-3 max-h-72 overflow-auto rounded-xl bg-slate-950 p-3 font-mono text-xs text-slate-200">
              <div v-if="!runDetail.logs?.length" class="text-slate-500">{{ emptyLogText(runDetail.status) }}</div>
              <div v-for="log in runDetail.logs" :key="log.id" :class="log.level === 'error' ? 'text-red-300' : log.level === 'warn' ? 'text-amber-300' : ''">
                [{{ log.level }}] {{ log.message }}
              </div>
            </div>
          </template>
        </div>
        <div class="flex justify-end gap-2 border-t border-slate-100 p-4 dark:border-slate-800">
          <button class="btn-ghost" @click="runOpen = false">关闭</button>
          <button
            v-if="runDetail && runDetail.status === 'failed'"
            class="btn-primary"
            :disabled="retrying"
            @click="retryRun"
          >
            <RotateCcw class="h-4 w-4" :class="{ 'animate-spin': retrying }" />
            {{ retrying ? '重试中…' : '重试' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 账号配置弹窗 -->
    <div v-if="formsOpen && formsAccount" class="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4" @pointerdown.self="formsOpen = false">
      <div class="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-2xl">
        <div class="flex items-start justify-between gap-2 border-b border-slate-100 p-4 dark:border-slate-800">
          <div>
            <div class="text-sm font-semibold">配置 · {{ formsAccount.displayName }}</div>
            <div class="mt-1 text-xs text-slate-500">执行偏移和表单资料；表单数据可用于活动填写，每个账号可以有多套。</div>
          </div>
          <button class="btn-ghost !px-2 !py-1.5" @click="formsOpen = false">
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="flex-1 space-y-4 overflow-auto p-4">
          <p v-if="error" class="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{{ error }}</p>
          <p v-if="message" class="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">{{ message }}</p>

          <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div class="text-sm font-semibold">执行偏移</div>
                <p class="mt-1 text-xs text-slate-500">计划时间不变，只在每次执行前延迟。0 表示不延迟。</p>
              </div>
              <div class="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="1440"
                  step="1"
                  class="input !w-24 !py-1 text-xs"
                  :value="formsAccount.timeOffsetMinutes"
                  :disabled="savingOffset === formsAccount.id"
                  title="计划时间不变，只在每次执行前延迟这么多分钟"
                  @change="saveOffset(formsAccount, $event)"
                />
                <span class="text-xs text-slate-500">分钟</span>
                <span v-if="savingOffset === formsAccount.id" class="text-xs text-slate-400">保存中…</span>
              </div>
            </div>
          </div>

          <div v-if="assignedTemplates.length === 0" class="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">
            还没有表单资料。在下面选择表单添加。
          </div>
          <div v-for="form in assignedTemplates" :key="form.templateId" class="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div class="text-sm font-semibold">{{ form.template.name }}</div>
                <div v-if="form.template.description" class="text-xs text-slate-500">{{ form.template.description }}</div>
              </div>
              <button class="btn-ghost !px-2 !py-1 text-xs text-red-600 dark:text-red-300" @click="removeForm(form.templateId, form.template.name)">
                <Trash2 class="h-4 w-4" />
              </button>
            </div>
            <div class="mt-3 grid gap-3 sm:grid-cols-2">
              <div v-for="field in form.template.fields" :key="field.key">
                <label class="label">
                  {{ field.label }}
                  <span v-if="field.required" class="text-red-500">*</span>
                </label>
                <select
                  v-if="field.type === 'select'"
                  v-model="formValues[form.templateId][field.key]"
                  class="input"
                >
                  <option value="">请选择</option>
                  <option v-for="option in field.options || []" :key="option" :value="option">{{ option }}</option>
                </select>
                <textarea
                  v-else-if="field.type === 'textarea'"
                  v-model="formValues[form.templateId][field.key]"
                  class="input min-h-20"
                  :placeholder="field.defaultValue || field.note"
                />
                <input
                  v-else
                  v-model="formValues[form.templateId][field.key]"
                  class="input"
                  :type="field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'tel' ? 'tel' : 'text'"
                  :placeholder="field.defaultValue || field.note"
                />
                <p v-if="field.note" class="mt-1 text-[11px] text-slate-500">{{ field.note }}</p>
              </div>
            </div>
            <div class="mt-3 flex justify-end">
              <button class="btn-primary !px-3 !py-1.5" :disabled="formsSaving" @click="saveForm(form.templateId)">
                保存 {{ form.template.name }}
              </button>
            </div>
          </div>

          <div v-if="availableTemplates.length > 0" class="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <div class="min-w-48 flex-1">
              <label class="label">添加表单资料</label>
              <select v-model="addTemplateId" class="input">
                <option value="">选择表单</option>
                <option v-for="template in availableTemplates" :key="template.id" :value="template.id">{{ template.name }}</option>
              </select>
            </div>
            <button class="btn-ghost" :disabled="!addTemplateId || formsSaving" @click="addForm">
              <Plus class="h-4 w-4" /> 添加
            </button>
          </div>
        </div>
        <div class="flex justify-between gap-2 border-t border-slate-100 p-4 dark:border-slate-800">
          <RouterLink to="/forms" class="btn-ghost" @click="formsOpen = false">管理表单配置</RouterLink>
          <button class="btn-ghost" @click="formsOpen = false">关闭</button>
        </div>
      </div>
    </div>

    <ActionFormModal
      :open="registrationModalOpen"
      title="注册账号"
      :fields="registrationFields"
      :submitting="registeringRunId === registrationRunId && Boolean(registeringRunId)"
      @close="registrationModalOpen = false"
      @submit="submitRegistrationForm"
    />
  </div>
</template>
