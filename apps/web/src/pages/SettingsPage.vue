<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { Bell, CheckCircle2, Circle, ListOrdered, RefreshCw, Save, Server } from 'lucide-vue-next';
import {
  api,
  type QueueConfig,
  type QueueStatus,
  type Settings,
  type SourceTestResult,
  type YybTestResult,
} from '../lib/api';
import { useToast } from '../lib/toast';
import ConfigSourceBadge from '../components/ConfigSourceBadge.vue';

const settings = ref<Settings | null>(null);
const yybBaseUrl = ref('');
const yybIntegrationToken = ref('');
const yybProtocolToken = ref('');
const scriptSourceUrl = ref('');
const serverchanToken = ref('');
const message = ref('');
const error = ref('');
const loading = ref(false);
const yybTesting = ref(false);
const yybTest = ref<YybTestResult | null>(null);
const sourceTesting = ref(false);
const sourceTest = ref<SourceTestResult | null>(null);
const toast = useToast();

watch(error, (value) => {
  if (!value) return;
  toast.error(value);
  error.value = '';
});

watch(message, (value) => {
  if (!value) return;
  toast.success(value);
  message.value = '';
});

const queueStatus = ref<QueueStatus | null>(null);
const queueSaving = ref(false);
const queueForm = reactive<QueueConfig>({
  concurrency: 1,
  perAccountConcurrency: 1,
  perSiteConcurrency: 1,
  runTimeoutMinutes: 2,
  maxQueueSize: 0,
  runMissedSchedules: true,
});

async function load() {
  try {
    const [settingsData, queueData] = await Promise.all([
      api.get<Settings>('/settings'),
      api.get<QueueStatus>('/queue'),
    ]);
    settings.value = settingsData;
    queueStatus.value = queueData;
    yybBaseUrl.value = settingsData.yybBaseUrl;
    scriptSourceUrl.value = settingsData.scriptSourceUrl;
    Object.assign(queueForm, queueData.config);
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  }
}

async function save() {
  error.value = '';
  message.value = '';
  loading.value = true;
  try {
    const payload: Record<string, string> = {};
    if (yybBaseUrl.value) payload.yybBaseUrl = yybBaseUrl.value;
    if (yybIntegrationToken.value) payload.yybIntegrationToken = yybIntegrationToken.value;
    if (yybProtocolToken.value) payload.yybProtocolToken = yybProtocolToken.value;
    if (scriptSourceUrl.value) payload.scriptSourceUrl = scriptSourceUrl.value;
    if (serverchanToken.value) payload.serverchanToken = serverchanToken.value;
    settings.value = await api.patch<Settings>('/settings', payload);
    yybIntegrationToken.value = '';
    yybProtocolToken.value = '';
    serverchanToken.value = '';
    message.value = '已保存';
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败';
  } finally {
    loading.value = false;
  }
}

async function testYyb() {
  error.value = '';
  message.value = '';
  yybTest.value = null;
  if (!yybBaseUrl.value.trim() && !settings.value?.yybBaseUrl) {
    error.value = '请先填写 YYB 地址';
    return;
  }
  yybTesting.value = true;
  try {
    const payload: Record<string, string> = {};
    if (yybBaseUrl.value.trim()) payload.baseUrl = yybBaseUrl.value.trim();
    if (yybIntegrationToken.value.trim()) {
      payload.integrationToken = yybIntegrationToken.value.trim();
    }
    if (yybProtocolToken.value.trim()) {
      payload.protocolToken = yybProtocolToken.value.trim();
    }
    yybTest.value = await api.post<YybTestResult>('/yyb/test', payload);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'YYB 连通测试失败';
  } finally {
    yybTesting.value = false;
  }
}

async function testSource() {
  error.value = '';
  message.value = '';
  sourceTest.value = null;
  if (!scriptSourceUrl.value.trim()) {
    error.value = '请先填写脚本源 index.json 地址';
    return;
  }
  sourceTesting.value = true;
  try {
    sourceTest.value = await api.post<SourceTestResult>('/app-store/sources/test', {
      indexUrl: scriptSourceUrl.value.trim(),
    });
  } catch (e) {
    error.value = e instanceof Error ? e.message : '脚本源测试失败';
  } finally {
    sourceTesting.value = false;
  }
}

async function testNotification() {
  error.value = '';
  message.value = '';
  try {
    await api.post('/notifications/test', { title: 'Free Welfare 测试', body: '通知配置正常。' });
    message.value = '测试通知已发送';
  } catch (e) {
    error.value = e instanceof Error ? e.message : '发送失败';
  }
}

async function saveQueue() {
  error.value = '';
  message.value = '';
  queueSaving.value = true;
  try {
    const updated = await api.patch<QueueConfig>('/queue/config', {
      concurrency: Number(queueForm.concurrency),
      perAccountConcurrency: Number(queueForm.perAccountConcurrency),
      perSiteConcurrency: Number(queueForm.perSiteConcurrency),
      runTimeoutMinutes: Number(queueForm.runTimeoutMinutes),
      maxQueueSize: Number(queueForm.maxQueueSize),
      runMissedSchedules: queueForm.runMissedSchedules,
    });
    Object.assign(queueForm, updated);
    queueStatus.value = await api.get<QueueStatus>('/queue');
    message.value = '运行队列设置已保存';
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存队列设置失败';
  } finally {
    queueSaving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="space-y-4">
    <div>
      <h2 class="text-lg font-semibold">设置</h2>
      <p class="text-sm text-slate-500">YYB、脚本源、通知、运行队列、时间。密钥只显示“已配置”。</p>
      <RouterLink to="/onboarding" class="mt-1 inline-block text-xs text-brand-600 hover:underline">新手引导 →</RouterLink>
      <RouterLink to="/notifications" class="ml-3 mt-1 inline-block text-xs text-brand-600 hover:underline">查看通知记录 →</RouterLink>
      <RouterLink to="/time" class="ml-3 mt-1 inline-block text-xs text-brand-600 hover:underline">时间设置 →</RouterLink>
      <RouterLink to="/yyb-requests" class="ml-3 mt-1 inline-block text-xs text-brand-600 hover:underline">YYB 请求记录 →</RouterLink>
      <RouterLink to="/forms" class="ml-3 mt-1 inline-block text-xs text-brand-600 hover:underline">表单配置 →</RouterLink>
      <RouterLink to="/sdk" class="ml-3 mt-1 inline-block text-xs text-brand-600 hover:underline">SDK 文档 →</RouterLink>
    </div>

    <form class="card space-y-4" @submit.prevent="save">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <Server class="h-4 w-4 text-slate-500" />
          <h3 class="text-sm font-semibold">YYB 连接</h3>
        </div>
        <button type="button" class="btn-ghost !px-3 !py-1.5" :disabled="yybTesting" @click="testYyb">
          <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': yybTesting }" />
          {{ yybTesting ? '测试中…' : '测试连通' }}
        </button>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="sm:col-span-2">
          <label class="label flex flex-wrap items-center gap-1.5">
            YYB 地址
            <code class="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">YYB_BASE_URL</code>
            <ConfigSourceBadge :source="settings?.sources?.yybBaseUrl" />
          </label>
          <input v-model="yybBaseUrl" class="input font-mono text-xs" placeholder="http://yyb-go:8000" @input="yybTest = null" />
        </div>
        <div>
          <label class="label flex flex-wrap items-center gap-1.5">
            集成令牌
            <code class="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">YYB_INTEGRATION_TOKEN</code>
            <ConfigSourceBadge :source="settings?.sources?.yybIntegrationToken" />
          </label>
          <input v-model="yybIntegrationToken" type="password" class="input" placeholder="留空不修改" autocomplete="off" @input="yybTest = null" />
        </div>
        <div>
          <label class="label flex flex-wrap items-center gap-1.5">
            协议令牌（可选）
            <code class="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">YYB_PROTOCOL_TOKEN</code>
            <ConfigSourceBadge :source="settings?.sources?.yybProtocolToken" />
          </label>
          <input v-model="yybProtocolToken" type="password" class="input" placeholder="留空不修改" autocomplete="off" @input="yybTest = null" />
        </div>
        <div class="sm:col-span-2">
          <label class="label flex flex-wrap items-center gap-1.5">
            脚本源 index.json
            <code class="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">SCRIPT_SOURCE_URL</code>
            <ConfigSourceBadge :source="settings?.sources?.scriptSourceUrl" />
          </label>
          <div class="flex flex-col gap-2 sm:flex-row">
            <input v-model="scriptSourceUrl" class="input font-mono text-xs" placeholder="https://raw.githubusercontent.com/.../index.json" @input="sourceTest = null" />
            <button type="button" class="btn-ghost shrink-0" :disabled="sourceTesting" @click="testSource">
              <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': sourceTesting }" />
              {{ sourceTesting ? '测试中…' : '测试源' }}
            </button>
          </div>
          <p v-if="sourceTest" class="mt-1 text-[11px] text-emerald-600 dark:text-emerald-300">
            连接成功：{{ sourceTest.scripts }} 个脚本、{{ sourceTest.apps }} 个应用（顶层 {{ sourceTest.topLevelScripts }}，应用内 {{ sourceTest.appScripts }}）
          </p>
        </div>
      </div>

      <div v-if="yybTest" class="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
        <div
          class="flex items-center gap-2 text-sm font-medium"
          :class="yybTest.ok ? 'text-emerald-700 dark:text-emerald-200' : 'text-amber-700 dark:text-amber-200'"
        >
          <CheckCircle2 v-if="yybTest.ok" class="h-4 w-4" />
          <Circle v-else class="h-4 w-4" />
          {{ yybTest.message }}
        </div>
        <ul class="mt-2 space-y-1.5 text-xs">
          <li v-for="check in yybTest.checks" :key="check.key" class="flex flex-wrap items-start gap-2">
            <CheckCircle2 v-if="check.ok && !check.skipped" class="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            <Circle v-else class="mt-0.5 h-3.5 w-3.5 shrink-0" :class="check.skipped ? 'text-slate-400' : 'text-amber-500'" />
            <span class="min-w-0 flex-1">
              <span class="font-medium">{{ check.label }}</span>
              <span class="text-slate-500"> · {{ check.message }}</span>
            </span>
            <RouterLink
              v-if="check.key === 'protocol' && check.accountCount === 0"
              :to="{ path: '/accounts', query: { add: '1' } }"
              class="shrink-0 rounded-lg bg-brand-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-brand-700"
            >
              添加账号
            </RouterLink>
          </li>
        </ul>
      </div>

      <div class="flex items-center gap-2 pt-2">
        <Bell class="h-4 w-4 text-slate-500" />
        <h3 class="text-sm font-semibold">通知</h3>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label class="label flex flex-wrap items-center gap-1.5">
            Server酱 token
            <code class="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">SERVERCHAN_TOKEN</code>
            <ConfigSourceBadge :source="settings?.sources?.serverchanToken" />
          </label>
          <input v-model="serverchanToken" type="password" class="input" placeholder="留空不修改" />
        </div>
        <div class="flex items-end">
          <button type="button" class="btn-ghost" @click="testNotification">测试通知</button>
        </div>
      </div>

      <div class="flex justify-end">
        <button class="btn-primary" type="submit" :disabled="loading">
          <Save class="h-4 w-4" />
          {{ loading ? '保存中…' : '保存设置' }}
        </button>
      </div>
    </form>

    <form class="card space-y-4" @submit.prevent="saveQueue">
      <div class="flex items-center gap-2">
        <ListOrdered class="h-4 w-4 text-slate-500" />
        <h3 class="text-sm font-semibold">运行队列</h3>
        <span class="text-xs text-slate-500">所有手动执行、活动、商品和计划任务都走同一个队列。</span>
      </div>

      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label class="label">同时执行任务数</label>
          <input v-model.number="queueForm.concurrency" type="number" min="1" max="20" class="input" />
          <p class="mt-1 text-[11px] text-slate-500">全局并发上限，默认 1。多账号可适当调大。</p>
        </div>
        <div>
          <label class="label">单账号同时执行数</label>
          <input v-model.number="queueForm.perAccountConcurrency" type="number" min="1" max="10" class="input" />
          <p class="mt-1 text-[11px] text-slate-500">同一个微信账号最多同时跑几个任务。</p>
        </div>
        <div>
          <label class="label">单应用同时执行数</label>
          <input v-model.number="queueForm.perSiteConcurrency" type="number" min="0" max="10" class="input" />
          <p class="mt-1 text-[11px] text-slate-500">同一应用多账号时避免同时运行；0 表示不限。</p>
        </div>
        <div>
          <label class="label">执行超时（分钟）</label>
          <input v-model.number="queueForm.runTimeoutMinutes" type="number" min="1" max="1440" class="input" />
          <p class="mt-1 text-[11px] text-slate-500">脚本运行超过该时间自动终止，默认 2 分钟；应用里可单独覆盖。</p>
        </div>
        <div>
          <label class="label">最大排队数量</label>
          <input v-model.number="queueForm.maxQueueSize" type="number" min="0" max="1000" class="input" />
          <p class="mt-1 text-[11px] text-slate-500">超过后手动任务会提示队列已满；0 表示不限制。</p>
        </div>
        <div>
          <label class="label">当前队列</label>
          <div class="input flex items-center gap-2 whitespace-nowrap text-xs text-slate-600 dark:text-slate-300">
            <span>运行 <b>{{ queueStatus?.active.running ?? 0 }}</b></span>
            <span class="text-slate-400">·</span>
            <span>启动 <b>{{ queueStatus?.active.starting ?? 0 }}</b></span>
            <span class="text-slate-400">·</span>
            <span>排队 <b>{{ queueStatus?.active.queued ?? 0 }}</b></span>
          </div>
          <p class="mt-1 text-[11px] text-slate-500">实时统计，不需要保存。</p>
        </div>
      </div>

      <label class="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 p-3 text-sm transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40">
        <input
          v-model="queueForm.runMissedSchedules"
          type="checkbox"
          class="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800"
        />
        <span>
          <span class="font-medium">启动时补跑错过的定时任务</span>
          <span class="mt-0.5 block text-[11px] text-slate-500">
            worker 每次启动时只检查一次计划时间已过、但还没运行的脚本。关闭后直接跳到下一个周期，不补跑停机期间错过的任务。
          </span>
        </span>
      </label>

      <div class="flex justify-end">
        <button class="btn-primary" type="submit" :disabled="queueSaving">
          <Save class="h-4 w-4" />
          {{ queueSaving ? '保存中…' : '保存队列设置' }}
        </button>
      </div>
    </form>

    <div class="card text-sm text-slate-500">
      <div class="font-medium text-slate-700 dark:text-slate-200">说明</div>
      <ul class="mt-2 list-disc space-y-1 pl-5">
        <li>YYB 自己部署；平台通过 `/integration/*` 同步账号和取码。</li>
        <li>脚本请求只走 SDK `ctx.http`；应用白名单在应用详情里配置。</li>
        <li>平台模式下自定义源脚本只能走 `ctx` API；青龙模式允许已有 `require` / `process.env` 脚本，请只运行可信代码。</li>
      </ul>
    </div>
  </div>
</template>
