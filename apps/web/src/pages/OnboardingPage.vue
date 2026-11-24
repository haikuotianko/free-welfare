<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  RefreshCw,
  Save,
  Server,
  Store,
} from 'lucide-vue-next';
import {
  api,
  type AppSource,
  type Settings,
  type SourceSyncResult,
  type SourceTestResult,
  type YybTestResult,
} from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useToast } from '../lib/toast';
import ConfigSourceBadge from '../components/ConfigSourceBadge.vue';

const DEFAULT_SOURCE_URL =
  'https://raw.githubusercontent.com/haikuotianko/free-welfare-scripts/main/index.json';

const auth = useAuthStore();
const router = useRouter();

const loading = ref(true);
const error = ref('');
const message = ref('');
const step = ref<1 | 2>(1);
const completing = ref(false);

const settings = ref<Settings | null>(null);
const sources = ref<AppSource[]>([]);

const yybBaseUrl = ref('');
const yybIntegrationToken = ref('');
const yybProtocolToken = ref('');
const yybTesting = ref(false);
const yybSaving = ref(false);
const yybTest = ref<YybTestResult | null>(null);

const sourceUrl = ref(DEFAULT_SOURCE_URL);
const sourceName = ref('Free Welfare 脚本源');
const sourceTesting = ref(false);
const sourceSaving = ref(false);
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

const yybDone = computed(() =>
  Boolean(settings.value?.yybBaseUrl && settings.value?.yybConfigured),
);
const sourceDone = computed(() =>
  sources.value.some((source) => source.indexUrl === sourceUrl.value.trim()),
);

async function load() {
  try {
    const [settingsData, sourceList] = await Promise.all([
      api.get<Settings>('/settings'),
      api.get<AppSource[]>('/app-store/sources'),
    ]);
    settings.value = settingsData;
    sources.value = sourceList;
    yybBaseUrl.value = settingsData.yybBaseUrl;
    sourceUrl.value = settingsData.scriptSourceUrl || DEFAULT_SOURCE_URL;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载配置失败';
  } finally {
    loading.value = false;
  }
}

function yybPayload() {
  const payload: Record<string, string> = {};
  if (yybBaseUrl.value.trim()) payload.yybBaseUrl = yybBaseUrl.value.trim();
  if (yybIntegrationToken.value.trim()) {
    payload.yybIntegrationToken = yybIntegrationToken.value.trim();
  }
  if (yybProtocolToken.value.trim()) {
    payload.yybProtocolToken = yybProtocolToken.value.trim();
  }
  return payload;
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

async function saveYyb() {
  error.value = '';
  message.value = '';
  if (!yybBaseUrl.value.trim() && !settings.value?.yybBaseUrl) {
    error.value = '请先填写 YYB 地址';
    return;
  }
  yybSaving.value = true;
  try {
    settings.value = await api.patch<Settings>('/settings', yybPayload());
    yybIntegrationToken.value = '';
    yybProtocolToken.value = '';
    if (!settings.value.yybConfigured) {
      message.value = 'YYB 配置已保存，但还没有集成令牌；可以先继续，之后再补。';
    } else if (!yybTest.value) {
      message.value = 'YYB 配置已保存；建议点“测试连通”确认真实可用。';
    } else if (!yybTest.value.ok) {
      message.value = 'YYB 配置已保存，但上次连通测试未通过；请检查测试结果。';
    } else {
      message.value = 'YYB 配置已保存，连通测试通过。';
    }
    step.value = 2;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存 YYB 配置失败';
  } finally {
    yybSaving.value = false;
  }
}

async function testSource() {
  error.value = '';
  message.value = '';
  sourceTest.value = null;
  const url = sourceUrl.value.trim();
  if (!url) {
    error.value = '请先填写应用源 index.json 地址';
    return;
  }
  sourceTesting.value = true;
  try {
    sourceTest.value = await api.post<SourceTestResult>('/app-store/sources/test', {
      indexUrl: url,
    });
  } catch (e) {
    error.value = e instanceof Error ? e.message : '应用源测试失败';
  } finally {
    sourceTesting.value = false;
  }
}

function repoUrlFromIndex(url: string) {
  const match = url.match(
    /^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\//i,
  );
  return match ? `https://github.com/${match[1]}/${match[2]}` : url;
}

async function saveSource() {
  error.value = '';
  message.value = '';
  const url = sourceUrl.value.trim();
  if (!url) {
    error.value = '请先填写应用源 index.json 地址';
    return;
  }
  if (!/^(https?:\/\/|local:\/\/)/i.test(url)) {
    error.value = '应用源地址只支持 http(s) 或 local://';
    return;
  }
  sourceSaving.value = true;
  try {
    let source = sources.value.find((item) => item.indexUrl === url);
    if (!source) {
      source = await api.post<AppSource>('/app-store/sources', {
        name: sourceName.value.trim() || 'Free Welfare 脚本源',
        repoUrl: repoUrlFromIndex(url),
        branch: 'main',
        indexUrl: url,
        trustLevel: 'official',
      });
    }
    const result = await api.post<SourceSyncResult>(
      `/app-store/sources/${source.id}/sync`,
    );
    settings.value = await api.patch<Settings>('/settings', {
      scriptSourceUrl: url,
    });
    sources.value = await api.get<AppSource[]>('/app-store/sources');
    message.value = `应用源已同步：${result.apps} 个应用、${result.scripts ?? result.synced} 个脚本。`;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存应用源失败';
  } finally {
    sourceSaving.value = false;
  }
}

async function finish(skipped = false) {
  if (skipped) {
    if (!window.confirm('跳过新手引导？之后可以在设置中重新打开。')) return;
  } else if (!yybDone.value || !sourceDone.value) {
    if (!window.confirm('还有步骤未完成，仍要结束引导吗？之后可以在设置中重新打开。')) {
      return;
    }
  }
  completing.value = true;
  error.value = '';
  try {
    await api.patch<Settings>('/settings', { onboardingCompleted: true });
    auth.markOnboardingCompleted();
    await router.push('/');
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存引导状态失败';
  } finally {
    completing.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold">新手引导</h2>
        <p class="mt-1 text-sm text-slate-500">
          先连接 YYB，再添加应用源。所有“测试”都会请求真实服务，不会伪造成功。
        </p>
      </div>
      <button class="btn-ghost !px-3 !py-1.5" :disabled="completing" @click="finish(true)">
        稍后配置
      </button>
    </div>

    <div class="card flex items-center gap-2 sm:gap-4">
      <button class="flex min-w-0 items-center gap-2 text-left" @click="step = 1">
        <span
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
          :class="step === 1 ? 'bg-brand-600 text-white' : yybDone ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'"
        >
          <CheckCircle2 v-if="yybDone && step !== 1" class="h-4 w-4" />
          <template v-else>1</template>
        </span>
        <span class="min-w-0">
          <span class="block text-sm font-medium">连接 YYB</span>
          <span class="block text-[11px] text-slate-500">{{ yybDone ? '已配置' : '待配置' }}</span>
        </span>
      </button>
      <div class="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
      <button class="flex min-w-0 items-center gap-2 text-left" @click="step = 2">
        <span
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
          :class="step === 2 ? 'bg-brand-600 text-white' : sourceDone ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'"
        >
          <CheckCircle2 v-if="sourceDone && step !== 2" class="h-4 w-4" />
          <template v-else>2</template>
        </span>
        <span class="min-w-0">
          <span class="block text-sm font-medium">添加应用源</span>
          <span class="block text-[11px] text-slate-500">{{ sourceDone ? '已添加' : '待添加' }}</span>
        </span>
      </button>
    </div>

    <div v-if="loading" class="card text-sm text-slate-500">正在加载配置…</div>

    <form v-else-if="step === 1" class="card space-y-4" @submit.prevent="saveYyb">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <Server class="h-4 w-4 text-slate-500" />
          <h3 class="text-sm font-semibold">第 1 步：连接 YYB</h3>
        </div>
        <span
          class="chip"
          :class="yybDone ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'"
        >
          {{ yybDone ? '已配置' : '待配置' }}
        </span>
      </div>

      <p class="text-xs text-slate-500">
        YYB 负责微信账号扫码、取码和协议调用。地址和令牌必须与 YYB 容器里的环境变量一致。
      </p>

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

      <div class="flex flex-wrap justify-end gap-2">
        <button type="button" class="btn-ghost" @click="step = 2">跳过此步</button>
        <button type="button" class="btn-ghost" :disabled="yybTesting" @click="testYyb">
          <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': yybTesting }" />
          {{ yybTesting ? '测试中…' : '测试连通' }}
        </button>
        <button type="submit" class="btn-primary" :disabled="yybSaving || completing">
          <Save class="h-4 w-4" />
          {{ yybSaving ? '保存中…' : '保存并继续' }}
          <ArrowRight class="h-4 w-4" />
        </button>
      </div>
    </form>

    <form v-else class="card space-y-4" @submit.prevent="saveSource">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <Store class="h-4 w-4 text-slate-500" />
          <h3 class="text-sm font-semibold">第 2 步：添加应用源</h3>
        </div>
        <span
          class="chip"
          :class="sourceDone ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'"
        >
          {{ sourceDone ? '已添加' : '待添加' }}
        </span>
      </div>

      <p class="text-xs text-slate-500">
        默认使用 Free Welfare 脚本仓库的 index.json。测试会真实下载并统计脚本数量；保存后会订阅并立即同步应用列表。
      </p>

      <div class="grid gap-3 sm:grid-cols-2">
        <div class="sm:col-span-2">
          <label class="label flex flex-wrap items-center gap-1.5">
            应用源 index.json
            <code class="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">SCRIPT_SOURCE_URL</code>
            <ConfigSourceBadge :source="settings?.sources?.scriptSourceUrl" />
          </label>
          <input v-model="sourceUrl" class="input font-mono text-xs" placeholder="https://.../index.json 或 local://app-store/index.json" @input="sourceTest = null" />
        </div>
        <div>
          <label class="label">显示名称</label>
          <input v-model="sourceName" class="input" placeholder="Free Welfare 脚本源" />
        </div>
        <div class="flex items-end">
          <button type="button" class="btn-ghost" :disabled="sourceTesting" @click="testSource">
            <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': sourceTesting }" />
            {{ sourceTesting ? '测试中…' : '测试连通' }}
          </button>
        </div>
      </div>

      <div v-if="sourceTest" class="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
        <div class="flex items-center gap-2 font-medium">
          <CheckCircle2 class="h-4 w-4" />
          连接成功：{{ sourceTest.scripts }} 个脚本、{{ sourceTest.apps }} 个应用
        </div>
        <p class="mt-1 text-xs text-emerald-700/80 dark:text-emerald-200/80">
          顶层脚本 {{ sourceTest.topLevelScripts }} 个，应用内脚本 {{ sourceTest.appScripts }} 个<span v-if="sourceTest.generatedAt">，生成时间 {{ sourceTest.generatedAt }}</span>。
        </p>
      </div>

      <p class="text-xs text-slate-500">
        已订阅 {{ sources.length }} 个应用源<span v-if="sourceDone">，当前地址已添加</span>。
      </p>

      <div class="flex flex-wrap justify-end gap-2">
        <button type="button" class="btn-ghost" @click="step = 1">上一步</button>
        <button type="button" class="btn-ghost" :disabled="completing" @click="finish(true)">稍后完成</button>
        <button type="submit" class="btn-primary" :disabled="sourceSaving || completing">
          <Save class="h-4 w-4" />
          {{ sourceSaving ? '同步中…' : '保存并同步' }}
        </button>
        <button type="button" class="btn-primary" :disabled="completing" @click="finish()">
          <CheckCircle2 class="h-4 w-4" />
          {{ completing ? '保存中…' : '完成引导' }}
        </button>
      </div>
    </form>

    <div class="card text-xs text-slate-500">
      <div class="font-medium text-slate-700 dark:text-slate-200">提示</div>
      <ul class="mt-2 list-disc space-y-1 pl-5">
        <li>YYB 与平台必须在同一个 Docker 网络里；默认网络名是 <code class="font-mono">qinglong_default</code>。</li>
        <li>集成令牌只用于平台同步账号和取码；协议令牌只用于扫码添加账号等协议接口。</li>
        <li>引导完成后不会再次自动弹出；需要复查时可在“设置”里重新打开。</li>
      </ul>
    </div>
  </div>
</template>
