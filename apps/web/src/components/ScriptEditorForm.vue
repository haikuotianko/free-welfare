<script setup lang="ts">
import { Save } from 'lucide-vue-next';
import type { SiteScriptFile } from '../lib/api';
import { describeCron } from '../lib/cron';

export interface ScriptFormValue {
  id: string;
  name: string;
  description: string;
  filePath: string;
  args: string;
  cron: string;
  enabled: boolean;
}

defineProps<{
  form: ScriptFormValue;
  files: SiteScriptFile[];
  saving: boolean;
}>();

const emit = defineEmits<{ save: []; cancel: []; editCron: [] }>();
</script>

<template>
  <form
    class="space-y-3 rounded-xl border border-brand-200 bg-brand-50/40 p-3 dark:border-brand-900 dark:bg-brand-900/10"
    @submit.prevent="emit('save')"
  >
    <div class="grid gap-3 sm:grid-cols-2">
      <div>
        <label class="label">名称</label>
        <input v-model="form.name" class="input" placeholder="例如：每日签到" />
      </div>
      <div>
        <label class="label">脚本文件</label>
        <select v-model="form.filePath" class="input">
          <option value="" disabled>选择文件</option>
          <option v-for="file in files" :key="file.path" :value="file.path">{{ file.path }}</option>
        </select>
      </div>
      <div class="sm:col-span-2">
        <label class="label">简介</label>
        <input v-model="form.description" class="input" placeholder="这个脚本做什么" />
      </div>
      <div class="sm:col-span-2">
        <label class="label">参数（默认空，例如：参数1 参数2）</label>
        <input v-model="form.args" class="input" placeholder="参数1" />
      </div>
      <div class="sm:col-span-2">
        <label class="label">定时（留空仅手动）</label>
        <div class="flex items-center gap-2">
          <input v-model="form.cron" class="input font-mono text-xs" placeholder="43 8 * * *" />
          <button class="btn-ghost shrink-0 !px-3 !py-1.5" type="button" @click="emit('editCron')">
            编辑
          </button>
        </div>
        <p class="mt-1 text-xs text-slate-500">
          {{ form.cron ? describeCron(form.cron) : '不自动运行，只能手动执行' }}
        </p>
      </div>
    </div>
    <label class="flex items-center gap-2 text-sm">
      <input v-model="form.enabled" type="checkbox" /> 启用
    </label>
    <div class="flex justify-end gap-2">
      <button type="button" class="btn-ghost" @click="emit('cancel')">取消</button>
      <button class="btn-primary" type="submit" :disabled="saving">
        <Save class="h-4 w-4" /> {{ saving ? '保存中…' : '保存脚本' }}
      </button>
    </div>
  </form>
</template>
