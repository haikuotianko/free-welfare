<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, AlertCircle, CheckCircle2, FileCode2, FolderOpen, ImagePlus, Pencil, Play, Plus, QrCode, Save, Trash2, X } from 'lucide-vue-next';
import {
  api,
  type Run,
  type Site,
  type SiteDetail,
  type SiteEnvVar,
  type SiteScript,
  type SiteScriptFile,
} from '../lib/api';
import { siteIconSrc } from '../lib/site-icon';
import { useEscapeClose } from '../lib/modal-escape';
import { describeCron } from '../lib/cron';
import AccountTransferModal from '../components/AccountTransferModal.vue';
import CronEditorModal from '../components/CronEditorModal.vue';
import Pagination from '../components/Pagination.vue';
import RunDetailPanel from '../components/RunDetailPanel.vue';
import ScriptEditorForm from '../components/ScriptEditorForm.vue';
import SectionNav from '../components/SectionNav.vue';
import {
  accountStatusLabels,
  labelOf,
  networkModeLabels,
  queueTicketText,
  registrationModeClass,
  registrationModeLabels,
  scriptModeLabels,
  siteStatusLabels,
} from '../lib/labels';
import CodeEditor from '../components/CodeEditor.vue';

const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.id));

const site = ref<SiteDetail | null>(null);
const scripts = ref<SiteScript[]>([]);
const files = ref<SiteScriptFile[]>([]);
const filePage = ref(1);
const filePageSize = 30;
const iconFiles = ref<SiteScriptFile[]>([]);
const envVars = ref<SiteEnvVar[]>([]);
const runAccountId = ref('');
const accountEditorOpen = ref(false);
const cronEditorOpen = ref(false);
const loading = ref(true);
const savingInfo = ref(false);
const savingNetwork = ref(false);
const savingScript = ref(false);
const savingFile = ref(false);
const savingEnv = ref(false);
const uploadingIcon = ref(false);
const iconInput = ref<HTMLInputElement | null>(null);
const scriptEditing = ref(false);
const qrPreview = ref(false);
const error = ref('');
const message = ref('');
const toast = ref<{ text: string; type: 'success' | 'error' } | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | null = null;
const runOpen = ref(false);
const runDetail = ref<Run | null>(null);
const runLoading = ref(false);
const runRetrying = ref(false);
const runningScriptId = ref('');
const scriptRunErrors = reactive<Record<string, string>>({});
let runPollTimer: ReturnType<typeof setTimeout> | null = null;
let runPollSeq = 0;

type PointsExpiryMode = 'none' | 'days' | 'month' | 'year';

function readPointsExpiry(
  config: Record<string, unknown> | null | undefined,
): { mode: PointsExpiryMode; days: string } {
  const raw = config?.pointsExpiry;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { mode: 'none' as PointsExpiryMode, days: '' };
  }
  const value = raw as Record<string, unknown>;
  if (value.mode === 'month' || value.mode === 'year') {
    return { mode: value.mode, days: '' };
  }
  if (value.mode === 'days') {
    const days = Number(value.days);
    return {
      mode: 'days' as PointsExpiryMode,
      days: Number.isFinite(days) && days > 0 ? String(Math.trunc(days)) : '',
    };
  }
  return { mode: 'none' as PointsExpiryMode, days: '' };
}

function pointsExpiryLabel(config: Record<string, unknown> | null | undefined) {
  const expiry = readPointsExpiry(config);
  if (expiry.mode === 'days') return expiry.days ? `${expiry.days} 天有效` : '';
  if (expiry.mode === 'month') return '按月过期';
  if (expiry.mode === 'year') return '按年过期';
  return '';
}

const infoForm = reactive({
  name: '',
  appId: '',
  iconUrl: '',
  description: '',
  pointsName: '积分',
  pointsExpiryMode: 'none' as PointsExpiryMode,
  pointsExpiryDays: '',
  scriptMode: 'platform',
  runTimeoutMinutes: '',
  registrationMode: 'unknown',
  registrationNote: '',
  configText: '{}',
});

const networkForm = reactive({
  mode: 'whitelist',
  rootUrlsText: '',
  notes: '',
});

const scriptForm = reactive({
  id: '',
  name: '',
  description: '',
  filePath: '',
  args: '',
  cron: '',
  enabled: true,
});

const fileEditor = reactive({
  path: '',
  content: '',
});

const qrCodeUrl = computed(() => {
  const metadata = (site.value?.metadata ?? {}) as Record<string, unknown>;
  const config = (site.value?.config ?? {}) as Record<string, unknown>;
  const candidates = [
    metadata.qrCodeUrl,
    metadata.qrcode,
    metadata.qr_code,
    config.qrCodeUrl,
    config.qrcode,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return '';
});
const newFilePath = ref('');

const siteSections = [
  { id: 'site-info', label: '应用信息' },
  { id: 'site-env', label: '环境变量' },
  { id: 'site-network', label: '网络配置' },
  { id: 'site-scripts', label: '应用脚本' },
  { id: 'site-files', label: '脚本文件' },
  { id: 'accounts', label: '应用账号' },
];

const savedIconSrc = computed(() => siteIconSrc(site.value));

const iconPreviewSrc = computed(() => {
  const value = infoForm.iconUrl.trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const params = new URLSearchParams({ path: value });
  if (site.value?.updatedAt) params.set('v', site.value.updatedAt);
  return `/api/v1/sites/${id.value}/icon?${params.toString()}`;
});

const pagedFiles = computed(() =>
  files.value.slice((filePage.value - 1) * filePageSize, filePage.value * filePageSize),
);

watch(
  () => files.value.length,
  (total) => {
    const totalPages = Math.max(1, Math.ceil(total / filePageSize));
    if (filePage.value > totalPages) filePage.value = totalPages;
  },
);

const runAccount = computed(
  () =>
    site.value?.siteAccounts.find((account) => account.id === runAccountId.value) ??
    site.value?.siteAccounts[0] ??
    null,
);

async function scrollToHash() {
  if (!route.hash) return;
  await nextTick();
  try {
    const target = document.querySelector(route.hash);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch {
    // 非法 hash 直接忽略。
  }
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const data = await api.get<SiteDetail>(`/sites/${id.value}`);
    site.value = data;
    scripts.value = data.scripts ?? [];
    for (const key of Object.keys(scriptRunErrors)) delete scriptRunErrors[key];
    if (!data.siteAccounts.some((account) => account.id === runAccountId.value)) {
      runAccountId.value = data.siteAccounts[0]?.id ?? '';
    }
    infoForm.name = data.name;
    infoForm.appId = data.appId;
    infoForm.iconUrl = data.iconUrl ?? '';
    infoForm.description = data.description ?? '';
    infoForm.pointsName = data.pointsName ?? '积分';
    const expiry = readPointsExpiry(data.config);
    infoForm.pointsExpiryMode = expiry.mode;
    infoForm.pointsExpiryDays = expiry.days;
    infoForm.scriptMode = data.scriptMode ?? 'platform';
    infoForm.runTimeoutMinutes =
      data.runTimeoutMinutes === null || data.runTimeoutMinutes === undefined
        ? ''
        : String(data.runTimeoutMinutes);
    infoForm.registrationMode = data.registrationMode ?? 'unknown';
    infoForm.registrationNote = data.registrationNote ?? '';
    infoForm.configText = JSON.stringify(data.config ?? {}, null, 2);
    networkForm.mode = data.networkMode ?? 'whitelist';
    networkForm.rootUrlsText = Array.isArray(data.rootUrls)
      ? data.rootUrls
          .map((root) => String(root.url ?? '').replace(/\/+$/, ''))
          .filter(Boolean)
          .join('\n')
      : '';
    networkForm.notes = data.networkNotes ?? '';

    await loadFiles();
    await loadIconFiles();
    await loadEnv();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  } finally {
    loading.value = false;
    void scrollToHash();
  }
}

async function loadFiles() {
  try {
    const data = await api.get<{ files: SiteScriptFile[] }>(`/sites/${id.value}/script-files`);
    files.value = data.files;
    filePage.value = 1;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '脚本文件加载失败';
  }
}

async function loadIconFiles() {
  try {
    const data = await api.get<{ files: SiteScriptFile[] }>(`/sites/${id.value}/icon-files`);
    iconFiles.value = data.files;
  } catch {
    iconFiles.value = [];
  }
}

async function loadEnv() {
  try {
    envVars.value = await api.get<SiteEnvVar[]>(`/sites/${id.value}/env`);
  } catch {
    envVars.value = [];
  }
}

async function accountsSaved() {
  message.value = '应用账号已更新';
  await load();
}

function showToast(text: string, type: 'success' | 'error' = 'success') {
  toast.value = { text, type };
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = null;
    toastTimer = null;
  }, 2600);
}

async function runScript(script: SiteScript) {
  if (runningScriptId.value) return;
  delete scriptRunErrors[script.id];
  if (!script.enabled) {
    scriptRunErrors[script.id] = '脚本已停用，请先在「编辑」里勾选启用后再运行';
    return;
  }
  if (!runAccount.value) {
    scriptRunErrors[script.id] = '请先在下方绑定一个微信账号';
    return;
  }
  error.value = '';
  message.value = '';
  runningScriptId.value = script.id;
  try {
    const run = await api.post<Run>(`/sites/${id.value}/scripts/${script.id}/run`, {
      accountId: runAccount.value.id,
    });
    message.value = queueTicketText(run.queue) || `已提交运行：${run.id.slice(0, 8)}`;
    await openRun(run.id);
  } catch (e) {
    scriptRunErrors[script.id] = e instanceof Error ? e.message : '提交运行失败';
  } finally {
    runningScriptId.value = '';
  }
}

function isRunActive(run: Run | null) {
  return Boolean(run && ['starting', 'queued', 'running'].includes(run.status));
}

async function openRun(runId: string) {
  runPollSeq += 1;
  const seq = runPollSeq;
  if (runPollTimer) {
    clearTimeout(runPollTimer);
    runPollTimer = null;
  }
  runOpen.value = true;
  runLoading.value = true;
  runDetail.value = null;
  try {
    const run = await api.get<Run>(`/runs/${runId}`);
    if (seq !== runPollSeq) return;
    runDetail.value = run;
    if (isRunActive(run)) scheduleRunPoll(runId, seq);
  } catch (e) {
    if (seq !== runPollSeq) return;
    runOpen.value = false;
    error.value = e instanceof Error ? e.message : '加载运行日志失败';
  } finally {
    if (seq === runPollSeq) runLoading.value = false;
  }
}

function scheduleRunPoll(runId: string, seq: number) {
  if (runPollTimer) clearTimeout(runPollTimer);
  runPollTimer = setTimeout(async () => {
    runPollTimer = null;
    if (seq !== runPollSeq || !runOpen.value) return;
    try {
      const run = await api.get<Run>(`/runs/${runId}`);
      if (seq !== runPollSeq) return;
      runDetail.value = run;
      if (isRunActive(run)) scheduleRunPoll(runId, seq);
    } catch {
      if (seq === runPollSeq) scheduleRunPoll(runId, seq);
    }
  }, 1000);
}

function closeRun() {
  runOpen.value = false;
  runPollSeq += 1;
  if (runPollTimer) {
    clearTimeout(runPollTimer);
    runPollTimer = null;
  }
}

useEscapeClose(closeRun, () => runOpen.value);
useEscapeClose(() => { qrPreview.value = false; }, () => qrPreview.value);

async function retryRun(run: Run) {
  runRetrying.value = true;
  try {
    const created = await api.post<Run>(`/runs/${run.id}/retry`);
    message.value = queueTicketText(created.queue) || `已重新提交：${created.id.slice(0, 8)}`;
    await openRun(created.id);
  } catch (e) {
    error.value = e instanceof Error ? e.message : '重跑失败';
  } finally {
    runRetrying.value = false;
  }
}

function addEnvVar() {
  envVars.value.push({
    id: '',
    key: '',
    value: '',
    secret: false,
    description: '',
    enabled: true,
  });
}

function removeEnvVar(index: number) {
  envVars.value.splice(index, 1);
}

async function saveEnv() {
  error.value = '';
  message.value = '';
  savingEnv.value = true;
  try {
    envVars.value = await api.put<SiteEnvVar[]>(`/sites/${id.value}/env`, {
      vars: envVars.value.map((item) => ({
        key: item.key,
        value: item.value,
        secret: item.secret,
        description: item.description,
        enabled: item.enabled,
      })),
    });
    message.value = '环境变量已保存';
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存环境变量失败';
  } finally {
    savingEnv.value = false;
  }
}

function pickIcon() {
  iconInput.value?.click();
}

function chooseIconFile(event: Event) {
  const select = event.target as HTMLSelectElement;
  if (select.value) infoForm.iconUrl = select.value;
  select.value = '';
}

async function uploadIcon(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  error.value = '';
  message.value = '';
  if (file.size > 512 * 1024) {
    error.value = '图标不能超过 512KB';
    return;
  }

  uploadingIcon.value = true;
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'));
      reader.readAsDataURL(file);
    });
    const updated = await api.put<Site>(`/sites/${id.value}/icon`, { dataUrl });
    infoForm.iconUrl = updated.iconUrl ?? '';
    if (site.value) {
      site.value.iconUrl = updated.iconUrl ?? null;
      site.value.updatedAt = updated.updatedAt;
    }
    message.value = '图标已上传';
    await loadIconFiles();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '上传图标失败';
  } finally {
    uploadingIcon.value = false;
  }
}

async function saveInfo() {
  error.value = '';
  message.value = '';
  savingInfo.value = true;
  try {
    let config: Record<string, unknown> = {};
    const raw = infoForm.configText.trim();
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('应用配置必须是 JSON 对象');
      }
      config = parsed as Record<string, unknown>;
    }
    const timeoutText = infoForm.runTimeoutMinutes.trim();
    const runTimeoutMinutes = timeoutText ? Number(timeoutText) : null;
    if (
      runTimeoutMinutes !== null &&
      (!Number.isInteger(runTimeoutMinutes) ||
        runTimeoutMinutes < 1 ||
        runTimeoutMinutes > 1440)
    ) {
      throw new Error('执行超时必须是 1-1440 分钟，留空则使用系统设置');
    }
    const expiryMode = infoForm.pointsExpiryMode;
    if (expiryMode === 'month' || expiryMode === 'year') {
      config.pointsExpiry = { mode: expiryMode };
    } else if (expiryMode === 'days') {
      const daysText = infoForm.pointsExpiryDays.trim();
      if (daysText) {
        const days = Number(daysText);
        if (!Number.isInteger(days) || days < 1 || days > 3650) {
          throw new Error('积分有效期必须是 1-3650 天，留空表示不设置');
        }
        config.pointsExpiry = { mode: 'days', days };
      } else {
        delete config.pointsExpiry;
      }
    } else {
      delete config.pointsExpiry;
    }
    await api.patch<Site>(`/sites/${id.value}`, {
      name: infoForm.name,
      appId: infoForm.appId,
      iconUrl: infoForm.iconUrl || '',
      description: infoForm.description,
      pointsName: infoForm.pointsName.trim() || '积分',
      scriptMode: infoForm.scriptMode,
      runTimeoutMinutes,
      registrationMode: infoForm.registrationMode,
      registrationNote: infoForm.registrationNote.trim(),
      config,
    });
    message.value = '应用信息已保存';
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败';
  } finally {
    savingInfo.value = false;
  }
}

function parseRootUrls(text: string): string[] {
  const tokens = text
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const origins = new Set<string>();
  for (const token of tokens) {
    const raw = /^https?:\/\//i.test(token) ? token : `https://${token}`;
    try {
      origins.add(new URL(raw).origin);
    } catch {
      // ignore invalid input; user can correct it
    }
  }
  return [...origins];
}

function rootIdFor(url: string, index: number, used: Set<string>): string {
  let base = `root${index + 1}`;
  try {
    const host = new URL(url).hostname.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
    if (host) base = host.slice(0, 50);
  } catch {
    // keep fallback id
  }
  let id = base;
  let suffix = 2;
  while (used.has(id)) id = `${base}-${suffix++}`;
  used.add(id);
  return id;
}

async function saveNetwork() {
  error.value = '';
  message.value = '';
  savingNetwork.value = true;
  try {
    const allowedOrigins = parseRootUrls(networkForm.rootUrlsText);
    const existing = new Map((site.value?.rootUrls ?? []).map((root) => [root.url, root]));
    const usedIds = new Set<string>();
    const rootUrls = allowedOrigins.map((url, index) => {
      const previous = existing.get(url);
      return {
        id: rootIdFor(url, index, usedIds),
        url,
        purpose: previous?.purpose ?? '',
        pathPrefix: previous?.pathPrefix ?? '',
        usedBy: previous?.usedBy ?? [],
        required: previous?.required ?? true,
      };
    });
    await api.put<SiteDetail>(`/sites/${id.value}/network`, {
      mode: networkForm.mode,
      rootUrls,
      allowedOrigins,
      notes: networkForm.notes,
    });
    message.value = '网络配置已保存';
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败';
  } finally {
    savingNetwork.value = false;
  }
}

function resetScriptForm() {
  scriptForm.id = '';
  scriptForm.name = '';
  scriptForm.description = '';
  scriptForm.filePath = files.value[0]?.path ?? '';
  scriptForm.args = '';
  scriptForm.cron = '';
  scriptForm.enabled = true;
}

function applyCron(cron: string) {
  scriptForm.cron = cron;
}

function addScript() {
  resetScriptForm();
  scriptEditing.value = true;
  message.value = '';
  error.value = '';
}

function editScript(script: SiteScript) {
  scriptForm.id = script.id;
  scriptForm.name = script.name;
  scriptForm.description = script.description;
  scriptForm.filePath = script.filePath;
  scriptForm.args = script.args;
  scriptForm.cron = script.cron ?? '';
  scriptForm.enabled = script.enabled;
  scriptEditing.value = true;
  message.value = '';
  error.value = '';
}

function cancelScript() {
  scriptEditing.value = false;
  resetScriptForm();
}

async function saveScript() {
  error.value = '';
  message.value = '';
  if (!scriptForm.name.trim() || !scriptForm.filePath.trim()) {
    showToast('名称和脚本文件不能为空', 'error');
    return;
  }
  savingScript.value = true;
  try {
    const body = {
      name: scriptForm.name,
      description: scriptForm.description,
      filePath: scriptForm.filePath,
      args: scriptForm.args,
      cron: scriptForm.cron,
      timezone:
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      enabled: scriptForm.enabled,
    };
    if (scriptForm.id) {
      const updated = await api.patch<SiteScript>(`/sites/${id.value}/scripts/${scriptForm.id}`, body);
      const index = scripts.value.findIndex((item) => item.id === updated.id);
      if (index >= 0) scripts.value[index] = updated;
      else scripts.value.push(updated);
      showToast('脚本已更新');
    } else {
      const created = await api.post<SiteScript>(`/sites/${id.value}/scripts`, body);
      scripts.value.push(created);
      showToast('脚本已添加');
    }
    scriptEditing.value = false;
    resetScriptForm();
  } catch (e) {
    showToast(e instanceof Error ? e.message : '保存脚本失败', 'error');
  } finally {
    savingScript.value = false;
  }
}

async function removeScript(script: SiteScript) {
  if (!window.confirm(`删除脚本「${script.name}」？`)) return;
  try {
    await api.del(`/sites/${id.value}/scripts/${script.id}`);
    scripts.value = scripts.value.filter((item) => item.id !== script.id);
    if (scriptEditing.value && scriptForm.id === script.id) {
      scriptEditing.value = false;
      resetScriptForm();
    }
    showToast('脚本已删除');
  } catch (e) {
    showToast(e instanceof Error ? e.message : '删除脚本失败', 'error');
  }
}

function fileLanguageKey(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'json') return 'json';
  if (['js', 'mjs', 'cjs'].includes(ext)) return 'javascript';
  if (ext === 'ts') return 'typescript';
  return 'text';
}

async function openFile(path: string) {
  error.value = '';
  message.value = '';
  try {
    const data = await api.get<{ path: string; content: string }>(
      `/sites/${id.value}/script-files/content?path=${encodeURIComponent(path)}`,
    );
    fileEditor.path = data.path;
    fileEditor.content = data.content;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '读取文件失败';
  }
}

function createFile() {
  const path = newFilePath.value.trim();
  if (!path) return;
  fileEditor.path = path;
  fileEditor.content = '// 在这里编写脚本\n';
  newFilePath.value = '';
}

async function saveFile() {
  if (!fileEditor.path.trim()) {
    error.value = '文件名不能为空';
    return;
  }
  error.value = '';
  message.value = '';
  savingFile.value = true;
  try {
    await api.put(`/sites/${id.value}/script-files/content`, {
      path: fileEditor.path,
      content: fileEditor.content,
    });
    message.value = `已保存 ${fileEditor.path}`;
    await loadFiles();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存文件失败';
  } finally {
    savingFile.value = false;
  }
}

async function removeFile(path: string) {
  if (!window.confirm(`删除文件 ${path}？引用它的脚本会失效。`)) return;
  try {
    await api.del(`/sites/${id.value}/script-files?path=${encodeURIComponent(path)}`);
    if (fileEditor.path === path) {
      fileEditor.path = '';
      fileEditor.content = '';
    }
    message.value = '文件已删除';
    await loadFiles();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除文件失败';
  }
}

function goBack() {
  const state = window.history.state as { back?: string | null } | null;
  if (state?.back) {
    router.back();
  } else {
    void router.push('/sites');
  }
}

async function removeSite() {
  if (!window.confirm(`确认删除应用「${site.value?.name}」？相关账号绑定/任务会一起删除。`)) return;
  try {
    await api.del(`/sites/${id.value}`);
    await router.push('/sites');
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除失败';
  }
}

function statusClass(status: string) {
  if (status === 'alive' || status === 'active') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200';
  if (status === 'expired' || status === 'broken') return 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200';
  if (status === 'session_only') return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

watch(
  () => route.hash,
  () => {
    if (!loading.value) void scrollToHash();
  },
);

onMounted(load);

onUnmounted(() => {
  runPollSeq += 1;
  if (runPollTimer) clearTimeout(runPollTimer);
  runPollTimer = null;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = null;
});
</script>

<template>
  <div v-if="loading" class="card text-sm text-slate-500">加载中…</div>

  <div v-else-if="site" class="flex items-start gap-6">
    <div
      v-if="toast"
      class="pointer-events-none fixed left-1/2 top-20 z-[60] flex max-w-[90vw] -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white shadow-xl"
      :class="toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'"
      role="status"
    >
      <CheckCircle2 v-if="toast.type === 'success'" class="h-4 w-4 shrink-0" />
      <AlertCircle v-else class="h-4 w-4 shrink-0" />
      <span class="min-w-0">{{ toast.text }}</span>
    </div>
    <div class="min-w-0 flex-1 space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-ghost !px-3 !py-1.5" @click="goBack">
          <ArrowLeft class="h-4 w-4" /> 返回
        </button>
        <RouterLink
          :to="{ path: '/files', query: { space: 'user', path: site.key } }"
          class="btn-ghost !px-3 !py-1.5"
        >
          <FolderOpen class="h-4 w-4" /> 文件管理
        </RouterLink>
        <button v-if="qrCodeUrl" class="btn-ghost !px-3 !py-1.5" @click="qrPreview = true">
          <QrCode class="h-4 w-4" /> 小程序码
        </button>
      </div>
      <button class="btn-ghost !px-3 !py-1.5 text-red-600 dark:text-red-300" @click="removeSite">
        <Trash2 class="h-4 w-4" /> 删除应用
      </button>
    </div>

    <p v-if="error" class="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{{ error }}</p>
    <p v-if="message" class="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">{{ message }}</p>

    <div class="card">
      <div class="flex flex-wrap items-center gap-4">
        <div class="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-brand-50 text-lg font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-100">
          <img v-if="savedIconSrc" :src="savedIconSrc" :alt="site.name" class="h-full w-full object-cover" />
          <span v-else>{{ site.name.slice(0, 1) }}</span>
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-lg font-semibold">{{ site.name }}</h2>
            <span class="chip" :class="statusClass(site.status)">{{ labelOf(siteStatusLabels, site.status) }}</span>
            <span class="chip bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-100">
              {{ labelOf(scriptModeLabels, site.scriptMode) }}
            </span>
            <span class="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {{ labelOf(networkModeLabels, site.networkMode) }}
            </span>
            <span
              v-if="pointsExpiryLabel(site.config)"
              class="chip bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-200"
            >
              {{ site.pointsName }} · {{ pointsExpiryLabel(site.config) }}
            </span>
            <span
              v-if="site.registrationMode && site.registrationMode !== 'unknown'"
              class="chip"
              :class="registrationModeClass(site.registrationMode)"
              :title="site.registrationNote || undefined"
            >
              {{ labelOf(registrationModeLabels, site.registrationMode) }}
            </span>
          </div>
          <div class="mt-1 text-xs text-slate-500">{{ site.key }} · {{ site.appId }}</div>
          <div v-if="site.registrationNote" class="mt-1 text-xs text-amber-600 dark:text-amber-300">
            注册：{{ site.registrationNote }}
          </div>
        </div>
      </div>
    </div>

    <form id="site-info" class="card scroll-mt-24 space-y-3" @submit.prevent="saveInfo">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold">应用信息</h3>
        <button class="btn-primary !px-3 !py-1.5" type="submit" :disabled="savingInfo">
          <Save class="h-4 w-4" /> {{ savingInfo ? '保存中…' : '保存' }}
        </button>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label class="label">名称</label>
          <input v-model="infoForm.name" class="input" />
        </div>
        <div>
          <label class="label">AppID</label>
          <input v-model="infoForm.appId" class="input" />
        </div>
        <div class="sm:col-span-2">
          <label class="label">图标</label>
          <div class="flex flex-wrap items-start gap-3">
            <div class="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-brand-50 text-lg font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-100">
              <img v-if="iconPreviewSrc" :src="iconPreviewSrc" :alt="infoForm.name" class="h-full w-full object-cover" />
              <span v-else>{{ infoForm.name.slice(0, 1) || '?' }}</span>
            </div>
            <div class="min-w-0 flex-1 basis-full space-y-2 sm:basis-auto">
              <input
                v-model="infoForm.iconUrl"
                class="input"
                placeholder="https://... 或 icon.png（应用目录内）"
              />
              <div class="flex flex-wrap items-center gap-2">
                <input
                  ref="iconInput"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/x-icon"
                  class="hidden"
                  @change="uploadIcon"
                />
                <button type="button" class="btn-ghost !px-3 !py-1.5" :disabled="uploadingIcon" @click="pickIcon">
                  <ImagePlus class="h-4 w-4" /> {{ uploadingIcon ? '上传中…' : '上传本地图片' }}
                </button>
                <select class="input !w-auto !py-1.5 text-xs" @change="chooseIconFile">
                  <option value="">从应用目录选择</option>
                  <option v-for="file in iconFiles" :key="file.path" :value="file.path">{{ file.path }}</option>
                </select>
              </div>
              <p class="text-xs text-slate-500">
                在线图标直接填 URL；脚本源里的图标通常就在应用目录下，可直接选择。上传的图片保存到应用目录的 `icons/`。
              </p>
            </div>
          </div>
        </div>
        <div>
          <label class="label">积分别名</label>
          <input v-model="infoForm.pointsName" class="input" placeholder="积分" />
          <p class="mt-1 text-xs text-slate-500">用于积分、商品、抢购、订单等页面；默认“积分”。</p>
        </div>
        <div>
          <label class="label">积分有效期</label>
          <div class="flex gap-2">
            <select v-model="infoForm.pointsExpiryMode" class="input !w-32">
              <option value="none">不设置</option>
              <option value="days">按天数</option>
              <option value="month">月过期</option>
              <option value="year">年过期</option>
            </select>
            <input
              v-if="infoForm.pointsExpiryMode === 'days'"
              v-model="infoForm.pointsExpiryDays"
              type="number"
              min="1"
              max="3650"
              class="input"
              placeholder="天数，留空不设置"
            />
          </div>
          <p class="mt-1 text-xs text-slate-500">
            <template v-if="infoForm.pointsExpiryMode === 'days'">输入 1-3650 天；留空表示不设置。</template>
            <template v-else-if="infoForm.pointsExpiryMode === 'month'">按自然月结束时间过期。</template>
            <template v-else-if="infoForm.pointsExpiryMode === 'year'">按自然年结束时间过期。</template>
            <template v-else>不记录积分有效期规则。</template>
          </p>
        </div>
        <div>
          <label class="label">执行超时（分钟）</label>
          <input
            v-model="infoForm.runTimeoutMinutes"
            type="number"
            min="1"
            max="1440"
            class="input"
            placeholder="留空使用系统设置"
          />
          <p class="mt-1 text-xs text-slate-500">脚本运行超过该时间会自动终止；留空使用系统默认值。</p>
        </div>
        <div>
          <label class="label">脚本模式</label>
          <select v-model="infoForm.scriptMode" class="input">
            <option value="platform">平台 SDK</option>
            <option value="qinglong">青龙兼容</option>
          </select>
          <p v-if="infoForm.scriptMode === 'qinglong'" class="mt-1 text-xs text-amber-600 dark:text-amber-300">
            青龙模式会注入 process.env，请只运行可信脚本。
          </p>
        </div>
        <div>
          <label class="label">注册方式</label>
          <select v-model="infoForm.registrationMode" class="input">
            <option v-for="(label, value) in registrationModeLabels" :key="value" :value="value">
              {{ label }}
            </option>
          </select>
          <p class="mt-1 text-xs text-slate-500">
            用于在应用卡片和详情里提示：自动注册、一键注册、需手动注册等。
          </p>
        </div>
        <div class="sm:col-span-2">
          <label class="label">注册说明</label>
          <input
            v-model="infoForm.registrationNote"
            class="input"
            maxlength="300"
            placeholder="例如：需在安吉尔小程序注册会员并绑定手机号"
          />
        </div>
        <div>
          <label class="label">应用 key（只读）</label>
          <input :value="site.key" class="input opacity-60" readonly />
        </div>
        <div class="sm:col-span-2">
          <label class="label">应用配置（JSON）</label>
          <textarea
            v-model="infoForm.configText"
            class="input min-h-24 font-mono text-xs"
            spellcheck="false"
            placeholder="{}"
          />
          <p class="mt-1 text-xs text-slate-500">脚本里通过 ctx.app.config 读取；环境变量通过 ctx.env 读取。</p>
        </div>
        <div class="sm:col-span-2">
          <label class="label">描述</label>
          <textarea v-model="infoForm.description" class="input min-h-20" />
        </div>
      </div>
    </form>

    <div id="site-env" class="card scroll-mt-24 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="text-sm font-semibold">环境变量</h3>
          <p class="mt-1 text-xs text-slate-500">
            青龙兼容模式会注入 process.env；平台脚本通过 ctx.env 读取。值加密存储；PEM 等多行值请保留换行。
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="btn-ghost !px-3 !py-1.5" type="button" @click="addEnvVar">
            <Plus class="h-4 w-4" /> 添加变量
          </button>
          <button class="btn-primary !px-3 !py-1.5" type="button" :disabled="savingEnv" @click="saveEnv">
            <Save class="h-4 w-4" /> {{ savingEnv ? '保存中…' : '保存变量' }}
          </button>
        </div>
      </div>

      <div v-if="envVars.length === 0" class="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">
        还没有环境变量。青龙脚本可以在这里配置 COOKIE、TOKEN 等启动变量。
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="(item, index) in envVars"
          :key="index"
          class="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800"
        >
          <div class="grid items-start gap-2 sm:grid-cols-2">
            <input v-model="item.key" class="input font-mono" placeholder="KEY，如 COOKIE" />
            <textarea
              v-model="item.value"
              rows="1"
              class="input h-[38px] resize-none font-mono text-xs leading-5"
              placeholder="值（PEM 私钥请保留换行）"
            />
          </div>
          <div class="flex flex-wrap items-center gap-3 text-sm">
            <label class="flex items-center gap-1.5">
              <input v-model="item.secret" type="checkbox" /> 秘密值
            </label>
            <label class="flex items-center gap-1.5">
              <input v-model="item.enabled" type="checkbox" /> 启用
            </label>
            <input v-model="item.description" class="input !w-auto flex-1 !py-1.5 text-xs" placeholder="说明（可选）" />
            <button type="button" class="text-xs text-red-600 dark:text-red-300" @click="removeEnvVar(index)">
              删除
            </button>
          </div>
        </div>
      </div>
    </div>

    <form id="site-network" class="card scroll-mt-24 space-y-3" @submit.prevent="saveNetwork">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-semibold">网络配置</h3>
          <p class="mt-1 text-xs text-slate-500">脚本只能请求白名单内的根 URL；http 和 https 都支持。</p>
        </div>
        <button class="btn-primary !px-3 !py-1.5" type="submit" :disabled="savingNetwork">
          <Save class="h-4 w-4" /> {{ savingNetwork ? '保存中…' : '保存' }}
        </button>
      </div>

      <div class="grid gap-3 sm:grid-cols-[180px,1fr]">
        <div>
          <label class="label">模式</label>
          <select v-model="networkForm.mode" class="input">
            <option value="whitelist">白名单</option>
            <option value="unrestricted">不限制（谨慎）</option>
          </select>
        </div>
        <div>
          <label class="label">根 URL</label>
          <textarea
            v-model="networkForm.rootUrlsText"
            class="input min-h-20 font-mono text-xs"
            placeholder="example.com; http://192.168.1.10:8080"
          />
        </div>
      </div>
      <p class="text-xs text-slate-500">
        不写协议时默认补 `https://`；显式写 `http://` 会原样保留。多个用换行、逗号或分号分隔。
      </p>
    </form>

    <div id="site-scripts" class="card scroll-mt-24 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="text-sm font-semibold">应用脚本</h3>
          <p class="mt-1 text-xs text-slate-500">
            名称、简介、脚本文件、参数、启用。
            <RouterLink to="/sdk" class="text-brand-600 hover:underline dark:text-brand-300">SDK 文档 →</RouterLink>
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <select v-if="site.siteAccounts.length > 1" v-model="runAccountId" class="input !w-auto !py-1.5 text-xs">
            <option v-for="account in site.siteAccounts" :key="account.id" :value="account.id">
              运行账号：{{ account.wechatAccount.alias || account.wechatAccount.displayName }}
            </option>
          </select>
          <button class="btn-primary !px-3 !py-1.5" @click="addScript">
            <Plus class="h-4 w-4" /> 添加脚本
          </button>
        </div>
      </div>

      <ScriptEditorForm
        v-if="scriptEditing && !scriptForm.id"
        :form="scriptForm"
        :files="files"
        :saving="savingScript"
        @save="saveScript"
        @cancel="cancelScript"
        @edit-cron="cronEditorOpen = true"
      />

      <div v-if="scripts.length === 0 && !scriptEditing" class="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">
        还没有脚本。先添加脚本文件，再点“添加脚本”填写名称、简介、文件和参数。
      </div>

      <div v-else class="space-y-2">
        <template v-for="script in scripts" :key="script.id">
        <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-medium">{{ script.name }}</span>
                <span class="chip" :class="script.enabled ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'">
                  {{ script.enabled ? '启用' : '停用' }}
                </span>
              </div>
              <div v-if="script.description" class="mt-1 text-xs text-slate-500">{{ script.description }}</div>
              <div class="mt-1 break-all font-mono text-xs text-slate-500">
                {{ script.filePath }}<span v-if="script.args"> {{ script.args }}</span>
              </div>
              <div v-if="script.cron" class="mt-1 text-xs text-slate-500">
                定时：{{ describeCron(script.cron) }}
                <span class="font-mono">（{{ script.cron }}）</span>
                <span v-if="script.nextRunAt"> · 下次 {{ new Date(script.nextRunAt).toLocaleString('zh-CN', { hour12: false }) }}</span>
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                class="btn-primary !px-2.5 !py-1.5"
                :disabled="Boolean(runningScriptId) || !script.enabled"
                :title="script.enabled ? '' : '脚本已停用，请先在「编辑」里启用'"
                @click="runScript(script)"
              >
                <Play class="h-3.5 w-3.5" /> {{ runningScriptId === script.id ? '提交中…' : '运行' }}
              </button>
              <button class="btn-ghost !px-2.5 !py-1.5" @click="editScript(script)">
                <Pencil class="h-3.5 w-3.5" /> 编辑
              </button>
              <button class="btn-ghost !px-2.5 !py-1.5 text-red-600 dark:text-red-300" @click="removeScript(script)">
                <Trash2 class="h-3.5 w-3.5" /> 删除
              </button>
            </div>
          </div>
          <p v-if="!script.enabled" class="mt-2 text-xs text-amber-600 dark:text-amber-300">
            脚本已停用，启用后才能运行；请点「编辑」勾选启用。
          </p>
          <p v-else-if="scriptRunErrors[script.id]" class="mt-2 text-xs text-red-600 dark:text-red-300">
            {{ scriptRunErrors[script.id] }}
          </p>
        </div>
        <ScriptEditorForm
          v-if="scriptEditing && scriptForm.id === script.id"
          :form="scriptForm"
          :files="files"
          :saving="savingScript"
          @save="saveScript"
          @cancel="cancelScript"
          @edit-cron="cronEditorOpen = true"
        />
        </template>
      </div>
    </div>

    <div id="site-files" class="card scroll-mt-24 space-y-3">
      <div>
        <h3 class="text-sm font-semibold">脚本文件</h3>
        <p class="mt-1 text-xs text-slate-500">应用目录下的脚本文件；可以查看、新建、编辑、删除。</p>
      </div>

      <div class="flex flex-wrap items-end gap-2">
        <div class="min-w-48 flex-1">
          <label class="label">新建文件</label>
          <input v-model="newFilePath" class="input font-mono text-xs" placeholder="index.js" />
        </div>
        <button class="btn-ghost" type="button" @click="createFile">
          <FileCode2 class="h-4 w-4" /> 新建/编辑
        </button>
      </div>

      <div v-if="files.length === 0" class="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">
        还没有脚本文件。上面输入文件名并点“新建/编辑”。
      </div>
      <div v-else class="space-y-2">
        <div v-for="file in pagedFiles" :key="file.path" class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
          <button class="min-w-0 text-left font-mono text-xs text-brand-600 hover:underline" @click="openFile(file.path)">
            {{ file.path }}
          </button>
          <div class="flex items-center gap-3 text-xs text-slate-500">
            <span>{{ formatBytes(file.size) }}</span>
            <button class="text-red-600 dark:text-red-300" @click="removeFile(file.path)">删除</button>
          </div>
        </div>
      </div>
      <Pagination :page="filePage" :total="files.length" :page-size="filePageSize" unit="个文件" @update:page="filePage = $event" />

      <div v-if="fileEditor.path" class="space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="font-mono text-xs text-slate-500">{{ fileEditor.path }}</div>
          <div class="flex gap-2">
            <button class="btn-ghost !px-3 !py-1.5" type="button" @click="fileEditor.path = ''; fileEditor.content = ''">关闭</button>
            <button class="btn-primary !px-3 !py-1.5" type="button" :disabled="savingFile" @click="saveFile">
              <Save class="h-4 w-4" /> {{ savingFile ? '保存中…' : '保存文件' }}
            </button>
          </div>
        </div>
        <div class="h-[28rem] overflow-hidden rounded-xl border border-slate-700 bg-[#1e1e1e]">
          <CodeEditor v-model="fileEditor.content" :language="fileLanguageKey(fileEditor.path)" />
        </div>
      </div>
    </div>

    <div id="accounts" class="card scroll-mt-24 space-y-3">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 class="text-sm font-semibold">应用账号</h3>
          <p class="mt-1 text-xs text-slate-500">脚本运行需要绑定微信账号；使用穿梭选择批量调整。</p>
        </div>
        <button class="btn-ghost !px-3 !py-1.5" @click="accountEditorOpen = true">
          <Pencil class="h-4 w-4" /> 编辑账号
        </button>
      </div>

      <div v-if="site.siteAccounts.length === 0" class="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">
        还没有绑定账号。点击右上角“编辑账号”选择要绑定的微信账号。
      </div>
      <div v-else class="space-y-2">
        <div v-for="account in site.siteAccounts" :key="account.id" class="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-medium">{{ account.wechatAccount.alias || account.wechatAccount.displayName }}</span>
              <span
                v-if="account.disabled"
                class="chip bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200"
              >
                已禁用自动运行
              </span>
              <span
                v-if="account.wechatAccount.disabled"
                class="chip bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200"
              >
                账号已停用
              </span>
            </div>
            <div class="text-xs text-slate-500">业务 ID：{{ account.businessUserId ?? '—' }}</div>
          </div>
          <div class="flex items-center gap-2 text-right">
            <div>
              <span class="chip" :class="statusClass(account.status)">{{ labelOf(accountStatusLabels, account.status) }}</span>
              <div class="mt-1 text-xs text-slate-500">余额：{{ account.pointAccount?.balance ?? '—' }}</div>
            </div>
            <RouterLink
              :to="{ path: '/accounts', query: { forms: account.wechatAccount.id } }"
              class="btn-ghost !px-2 !py-1"
            >
              编辑资料
            </RouterLink>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="runOpen"
      class="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4"
      @pointerdown.self="closeRun"
    >
      <div class="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-2xl">
        <div class="flex items-start justify-between gap-2 border-b border-slate-100 p-4 dark:border-slate-800">
          <div class="min-w-0">
            <div class="text-sm font-semibold">运行日志</div>
            <p v-if="runDetail" class="mt-1 truncate text-xs text-slate-500">
              {{ runDetail.site?.name ?? site.name }} ·
              {{ runDetail.siteScript?.name ?? '任务' }}
              <span v-if="runDetail.siteAccount?.wechatAccount?.displayName">
                · {{ runDetail.siteAccount.wechatAccount.alias || runDetail.siteAccount.wechatAccount.displayName }}
              </span>
            </p>
          </div>
          <button class="btn-ghost !px-2 !py-1.5" @click="closeRun">
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="min-h-0 flex-1 overflow-auto p-4">
          <RunDetailPanel
            :run="runDetail"
            :loading="runLoading"
            :retrying="runRetrying"
            @retry="retryRun"
          />
        </div>
        <div class="flex justify-end gap-2 border-t border-slate-100 p-4 dark:border-slate-800">
          <RouterLink
            v-if="runDetail"
            :to="{ path: '/runs', query: { run: runDetail.id } }"
            class="btn-ghost"
            @click="closeRun"
          >
            在运行页查看
          </RouterLink>
          <button class="btn-ghost" @click="closeRun">关闭</button>
        </div>
      </div>
    </div>

    <div v-if="qrPreview" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" @pointerdown.self="qrPreview = false">
      <div class="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-900">
        <div class="flex items-center justify-between gap-2">
          <div>
            <div class="text-sm font-semibold">小程序码</div>
            <div class="text-xs text-slate-500">{{ site.name }}</div>
          </div>
          <button class="btn-ghost !px-2 !py-1.5" @click="qrPreview = false">
            <X class="h-4 w-4" />
          </button>
        </div>
        <img :src="qrCodeUrl" alt="小程序码" class="mx-auto mt-4 max-h-[60vh] w-full rounded-xl object-contain" />
      </div>
    </div>

    <AccountTransferModal
      :open="accountEditorOpen && Boolean(site)"
      :site="site"
      @close="accountEditorOpen = false"
      @saved="accountsSaved"
    />
    <CronEditorModal
      :open="cronEditorOpen"
      :value="scriptForm.cron"
      @close="cronEditorOpen = false"
      @save="applyCron"
    />
    </div>

    <aside class="sticky top-20 hidden w-40 shrink-0 xl:block">
      <SectionNav :items="siteSections" />
    </aside>
  </div>

  <div v-else class="card text-sm text-slate-500">应用不存在。</div>
</template>
