<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  BookOpen,
  CalendarCheck,
  FileText,
  FolderOpen,
  FormInput,
  Globe2,
  Home,
  LogOut,
  Moon,
  MoreHorizontal,
  Package,
  PlayCircle,
  ScrollText,
  Settings,
  Store,
  Sun,
  Users,
  X,
} from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import { useAccountStore } from '../stores/account';
import { useEscapeClose } from '../lib/modal-escape';
import ClockWidget from '../components/ClockWidget.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const accounts = useAccountStore();
const dark = ref(document.documentElement.classList.contains('dark'));

const desktopNav = [
  { to: '/', label: '总览', icon: Home },
  { to: '/accounts', label: '账号', icon: Users },
  { to: '/sites', label: '应用', icon: Globe2 },
  { to: '/store', label: '应用商店', icon: Store },
  { to: '/products', label: '商品', icon: Package },
  { to: '/activities', label: '活动', icon: CalendarCheck },
  { to: '/forms', label: '表单', icon: FormInput },
  { to: '/files', label: '文件', icon: FolderOpen },
  { to: '/runs', label: '运行', icon: PlayCircle },
  { to: '/logs', label: '日志', icon: FileText },
  { to: '/yyb-requests', label: 'YYB 请求', icon: ScrollText },
  { to: '/sdk', label: 'SDK 文档', icon: BookOpen },
  { to: '/settings', label: '设置', icon: Settings },
];

const mobileNav = [
  { to: '/', label: '首页', icon: Home },
  { to: '/accounts', label: '账号', icon: Users },
  { to: '/runs', label: '运行', icon: PlayCircle },
  { to: '/settings', label: '我的', icon: Settings },
];

const moreNav = [
  { to: '/sites', label: '应用', icon: Globe2 },
  { to: '/store', label: '应用商店', icon: Store },
  { to: '/products', label: '商品', icon: Package },
  { to: '/activities', label: '活动', icon: CalendarCheck },
  { to: '/forms', label: '表单', icon: FormInput },
  { to: '/files', label: '文件', icon: FolderOpen },
  { to: '/logs', label: '日志', icon: FileText },
  { to: '/yyb-requests', label: 'YYB 请求', icon: ScrollText },
  { to: '/sdk', label: 'SDK 文档', icon: BookOpen },
];

const title = computed(() => String(route.meta.title ?? 'Free Welfare'));
const moreOpen = ref(false);
const moreActive = computed(() =>
  moreNav.some((item) => route.path === item.to || route.path.startsWith(`${item.to}/`)),
);

useEscapeClose(() => { moreOpen.value = false; }, () => moreOpen.value);

function toggleTheme() {
  dark.value = !dark.value;
  document.documentElement.classList.toggle('dark', dark.value);
  localStorage.setItem('fw-theme', dark.value ? 'dark' : 'light');
}

function onAccountChange(event: Event) {
  accounts.select((event.target as HTMLSelectElement).value);
}

async function logout() {
  await auth.logout();
  accounts.reset();
  await router.push('/login');
}

onMounted(() => {
  void accounts.load().catch(() => undefined);
});
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <aside class="fixed inset-y-0 left-0 hidden w-60 border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 lg:block">
      <div class="mb-8 flex items-center gap-2 px-2">
        <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">FW</div>
        <div>
          <div class="text-sm font-semibold">Free Welfare</div>
          <div class="text-xs text-slate-500">自托管福利工具</div>
        </div>
      </div>
      <nav class="space-y-1">
        <RouterLink
          v-for="item in desktopNav"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          active-class="bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-100"
        >
          <component :is="item.icon" class="h-4 w-4" />
          {{ item.label }}
        </RouterLink>
      </nav>
    </aside>

    <div class="lg:pl-60">
      <header class="sticky top-0 z-10 flex min-h-16 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white/90 px-4 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:px-6">
        <div class="min-w-0">
          <h1 class="truncate text-base font-semibold">{{ title }}</h1>
          <p class="truncate text-xs text-slate-500">{{ auth.admin?.username }}</p>
        </div>
        <div class="ml-auto flex items-center gap-1.5 sm:gap-2">
          <ClockWidget />
          <select
            v-if="accounts.accounts.length > 0"
            id="current-account"
            name="currentAccount"
            :value="accounts.selectedId"
            class="input !w-24 !min-h-10 !py-1.5 text-xs sm:!w-36"
            title="当前账号"
            aria-label="当前账号"
            @change="onAccountChange"
          >
            <option value="">全部账号</option>
            <option v-for="account in accounts.accounts" :key="account.id" :value="account.id">
              {{ account.displayName }}
            </option>
          </select>
          <button class="btn-ghost !min-h-10 !px-3" title="切换主题" @click="toggleTheme">
            <Sun v-if="dark" class="h-4 w-4" />
            <Moon v-else class="h-4 w-4" />
          </button>
          <button class="btn-ghost !min-h-10 !px-3" title="退出登录" @click="logout">
            <LogOut class="h-4 w-4" />
          </button>
        </div>
      </header>

      <main class="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 lg:pb-8">
        <RouterView />
      </main>
    </div>

    <nav class="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:hidden">
      <RouterLink
        v-for="item in mobileNav"
        :key="item.to"
        :to="item.to"
        class="flex flex-col items-center gap-1 py-2 text-[10px] text-slate-500"
        active-class="text-brand-600 dark:text-brand-300"
      >
        <component :is="item.icon" class="h-5 w-5" />
        {{ item.label }}
      </RouterLink>
      <button
        type="button"
        class="flex flex-col items-center gap-1 py-2 text-[10px]"
        :class="moreActive ? 'text-brand-600 dark:text-brand-300' : 'text-slate-500'"
        aria-label="更多菜单"
        @click="moreOpen = true"
      >
        <MoreHorizontal class="h-5 w-5" />
        更多
      </button>
    </nav>

    <div
      v-if="moreOpen"
      class="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
      @pointerdown.self="moreOpen = false"
    >
      <div class="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl dark:bg-slate-900">
        <div class="mb-3 flex items-center justify-between">
          <div class="text-sm font-semibold">更多</div>
          <button type="button" class="btn-ghost !px-2 !py-1.5" @click="moreOpen = false">
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <RouterLink
            v-for="item in moreNav"
            :key="item.to"
            :to="item.to"
            class="flex flex-col items-center gap-2 rounded-xl border border-slate-200 px-2 py-3 text-xs text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/60"
            @click="moreOpen = false"
          >
            <component :is="item.icon" class="h-5 w-5" />
            {{ item.label }}
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
