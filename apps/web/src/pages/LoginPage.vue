<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();
const username = ref('admin');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    await auth.login(username.value, password.value);
    await router.push(auth.onboardingCompleted ? '/' : '/onboarding');
  } catch (e) {
    error.value = e instanceof Error ? e.message : '登录失败';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
    <div class="card w-full max-w-md">
      <div class="mb-6">
        <div class="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">FW</div>
        <h1 class="text-xl font-semibold">登录 Free Welfare</h1>
        <p class="mt-1 text-sm text-slate-500">使用管理员账号登录。</p>
      </div>
      <form class="space-y-4" @submit.prevent="submit">
        <div>
          <label class="label">用户名</label>
          <input id="username" name="username" v-model="username" class="input" autocomplete="username" />
        </div>
        <div>
          <label class="label">密码</label>
          <input id="password" name="password" v-model="password" type="password" class="input" autocomplete="current-password" />
        </div>
        <p v-if="error" class="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{{ error }}</p>
        <button class="btn-primary w-full" :disabled="loading">
          {{ loading ? '登录中…' : '登录' }}
        </button>
      </form>
    </div>
  </div>
</template>
