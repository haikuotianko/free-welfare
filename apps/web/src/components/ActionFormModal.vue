<script setup lang="ts">
import { reactive, watch } from 'vue';
import { X } from 'lucide-vue-next';
import type { ActionFormField } from '../lib/api';

const props = defineProps<{
  open: boolean;
  title?: string;
  fields: ActionFormField[];
  submitting?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [values: Record<string, string>];
}>();

const values = reactive<Record<string, string | boolean>>({});
const errors = reactive<Record<string, string>>({});

function reset() {
  for (const key of Object.keys(values)) delete values[key];
  for (const key of Object.keys(errors)) delete errors[key];
  for (const field of props.fields) {
    values[field.key] =
      field.type === 'checkbox'
        ? field.defaultValue === 'true'
        : field.defaultValue ?? '';
  }
}

watch(
  () => [props.open, props.fields] as const,
  () => {
    if (props.open) reset();
  },
  { deep: true, immediate: true },
);

function fieldValue(key: string): string {
  const value = values[key];
  return typeof value === 'string' ? value : '';
}

function checked(key: string): boolean {
  return values[key] === true;
}

function setValue(key: string, value: string | boolean) {
  values[key] = value;
  delete errors[key];
}

function validate(): boolean {
  for (const key of Object.keys(errors)) delete errors[key];
  for (const field of props.fields) {
    if (!field.required) continue;
    const value = values[field.key];
    if (field.type === 'checkbox' ? value !== true : !String(value ?? '').trim()) {
      errors[field.key] = `请填写「${field.label}」`;
    }
  }
  return Object.keys(errors).length === 0;
}

function submit() {
  if (props.submitting || !validate()) return;
  const payload: Record<string, string> = {};
  for (const field of props.fields) {
    const value = values[field.key];
    payload[field.key] =
      field.type === 'checkbox'
        ? value === true
          ? 'true'
          : 'false'
        : String(value ?? '').trim();
  }
  emit('submit', payload);
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4"
    @pointerdown.self="emit('close')"
  >
    <form
      class="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900"
      @submit.prevent="submit"
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-base font-semibold">{{ title || '注册' }}</div>
          <p class="mt-1 text-xs text-slate-500">
            请填写小程序注册要求的必填信息，提交后会使用当前微信账号执行注册。
          </p>
        </div>
        <button
          type="button"
          class="btn-ghost !px-2 !py-1.5"
          :disabled="submitting"
          @click="emit('close')"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <div class="max-h-[60vh] space-y-3 overflow-auto">
        <div v-for="field in fields" :key="field.key">
          <label class="label">
            {{ field.label }}
            <span v-if="field.required" class="text-red-500">*</span>
          </label>

          <template v-if="field.type === 'checkbox'">
            <label class="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
              <input
                type="checkbox"
                class="h-4 w-4 accent-brand-600"
                :checked="checked(field.key)"
                @change="setValue(field.key, ($event.target as HTMLInputElement).checked)"
              />
              <span>{{ field.placeholder || field.label }}</span>
            </label>
          </template>

          <template v-else-if="field.type === 'select'">
            <select
              class="input"
              :value="fieldValue(field.key)"
              @change="setValue(field.key, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">请选择</option>
              <option v-for="option in field.options ?? []" :key="option" :value="option">
                {{ option }}
              </option>
            </select>
          </template>

          <template v-else-if="field.type === 'textarea'">
            <textarea
              class="input min-h-24"
              :value="fieldValue(field.key)"
              :placeholder="field.placeholder || ''"
              @input="setValue(field.key, ($event.target as HTMLTextAreaElement).value)"
            />
          </template>

          <template v-else>
            <input
              class="input"
              :type="field.type === 'tel' || field.type === 'number' ? field.type : 'text'"
              :value="fieldValue(field.key)"
              :placeholder="field.placeholder || ''"
              @input="setValue(field.key, ($event.target as HTMLInputElement).value)"
            />
          </template>

          <p v-if="field.note" class="mt-1 text-[11px] text-slate-500">{{ field.note }}</p>
          <p v-if="errors[field.key]" class="mt-1 text-xs text-red-600 dark:text-red-300">
            {{ errors[field.key] }}
          </p>
        </div>
      </div>

      <div class="flex justify-end gap-2">
        <button type="button" class="btn-ghost" :disabled="submitting" @click="emit('close')">
          取消
        </button>
        <button type="submit" class="btn-primary" :disabled="submitting">
          {{ submitting ? '提交中…' : '提交注册' }}
        </button>
      </div>
    </form>
  </div>
</template>
