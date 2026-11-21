<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { FormInput, Pencil, Plus, Save, Trash2, Users } from 'lucide-vue-next';
import { api, type FormField, type FormTemplate } from '../lib/api';
import Pagination from '../components/Pagination.vue';

const templates = ref<FormTemplate[]>([]);
const loading = ref(false);
const error = ref('');
const message = ref('');
const editingId = ref('');
const saving = ref(false);
const page = ref(1);
const pageSize = 10;
const pagedTemplates = computed(() =>
  templates.value.slice((page.value - 1) * pageSize, page.value * pageSize),
);

watch(
  () => templates.value.length,
  (total) => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page.value > totalPages) page.value = totalPages;
  },
);

const form = reactive({
  name: '',
  description: '',
  fields: [] as FormField[],
});

const editing = computed(() => Boolean(editingId.value));
const editingTemplate = computed(
  () => templates.value.find((template) => template.id === editingId.value) ?? null,
);

function blankField(index: number): FormField {
  return {
    key: 'field_' + (index + 1),
    label: '',
    type: 'text',
    defaultValue: '',
    note: '',
    required: false,
    options: [],
  };
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    templates.value = await api.get<FormTemplate[]>('/forms');
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

function reset() {
  editingId.value = '';
  form.name = '';
  form.description = '';
  form.fields = [];
}

function startCreate() {
  reset();
  form.fields = [blankField(0)];
}

function startEdit(template: FormTemplate) {
  editingId.value = template.id;
  form.name = template.name;
  form.description = template.description;
  form.fields = (template.fields || []).map((field) => ({
    ...field,
    options: Array.isArray(field.options) ? [...field.options] : [],
  }));
}

function addField() {
  form.fields.push(blankField(form.fields.length));
}

function addOption(field: FormField) {
  field.options = [...(field.options ?? []), ''];
}

function removeOption(field: FormField, index: number) {
  field.options = (field.options ?? []).filter((_, itemIndex) => itemIndex !== index);
}

function removeField(index: number) {
  form.fields.splice(index, 1);
}

function moveField(index: number, delta: number) {
  const target = index + delta;
  if (target < 0 || target >= form.fields.length) return;
  const [field] = form.fields.splice(index, 1);
  form.fields.splice(target, 0, field);
}

async function save() {
  error.value = '';
  message.value = '';
  if (!form.name.trim()) {
    error.value = '请填写表单名称';
    return;
  }
  if (form.fields.length === 0) {
    error.value = '至少添加一个字段';
    return;
  }
  for (const [index, field] of form.fields.entries()) {
    if (!field.label.trim() || !field.key.trim()) {
      error.value = `第 ${index + 1} 个字段缺少名称或 key`;
      return;
    }
  }
  const keys = form.fields.map((field) => field.key.trim());
  if (new Set(keys).size !== keys.length) {
    error.value = '字段 key 不能重复';
    return;
  }
  saving.value = true;
  try {
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      fields: form.fields.map((field) => ({
        ...field,
        label: field.label.trim(),
        key: field.key.trim(),
        defaultValue: field.defaultValue || '',
        note: field.note || '',
        options:
          field.type === 'select'
            ? (field.options ?? []).map((option) => option.trim()).filter(Boolean)
            : [],
      })),
    };
    if (editingId.value) {
      await api.patch(`/forms/${editingId.value}`, payload);
      message.value = '表单已保存';
    } else {
      await api.post('/forms', payload);
      message.value = '表单已创建';
    }
    reset();
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败';
  } finally {
    saving.value = false;
  }
}

async function removeTemplate(template: FormTemplate | null) {
  if (!template) return;
  if (!window.confirm(`删除表单「${template.name}」？账号里已填写的数据也会删除。`)) return;
  error.value = '';
  message.value = '';
  try {
    await api.del(`/forms/${template.id}`);
    if (editingId.value === template.id) reset();
    message.value = '表单已删除';
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除失败';
  }
}

onMounted(load);
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold">表单配置</h2>
        <p class="text-sm text-slate-500">
          定义活动/脚本需要的通用资料，例如手机号、生日、地址；账号里再填写每个账号的真实数据。
        </p>
      </div>
      <button class="btn-primary" @click="startCreate">
        <Plus class="h-4 w-4" /> 新建表单
      </button>
    </div>

    <p v-if="error" class="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{{ error }}</p>
    <p v-if="message" class="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">{{ message }}</p>

    <div class="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <div class="card space-y-3">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-sm font-semibold">表单列表</h3>
          <span class="text-xs text-slate-500">{{ templates.length }} 个</span>
        </div>
        <div v-if="loading && templates.length === 0" class="py-6 text-center text-sm text-slate-500">加载中…</div>
        <div v-else-if="templates.length === 0" class="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">
          还没有表单。新建一个，然后在账号里填写数据。
        </div>
        <div v-else class="space-y-2">
          <button
            v-for="template in pagedTemplates"
            :key="template.id"
            class="w-full rounded-xl border px-3 py-2 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800"
            :class="editingId === template.id ? 'border-brand-500' : 'border-slate-200 dark:border-slate-800'"
            @click="startEdit(template)"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="font-medium">{{ template.name }}</span>
              <span class="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <Users class="mr-1 h-3 w-3" /> {{ template._count?.accountForms ?? 0 }}
              </span>
            </div>
            <div v-if="template.description" class="mt-1 line-clamp-1 text-xs text-slate-500">{{ template.description }}</div>
            <div class="mt-1 text-xs text-slate-500">{{ template.fields?.length ?? 0 }} 个字段</div>
          </button>
        </div>
        <Pagination :page="page" :total="templates.length" :page-size="pageSize" unit="个表单" @update:page="page = $event" />
      </div>

      <div class="card space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <FormInput class="h-4 w-4 text-slate-500" />
            <h3 class="text-sm font-semibold">{{ editing ? '编辑表单' : '新建表单' }}</h3>
          </div>
          <div v-if="editing" class="flex gap-2">
            <button class="btn-ghost !px-3 !py-1.5" @click="reset">取消编辑</button>
            <button class="btn-ghost !px-3 !py-1.5 text-red-600 dark:text-red-300" @click="removeTemplate(editingTemplate)">
              <Trash2 class="h-4 w-4" /> 删除
            </button>
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label class="label">表单名称</label>
            <input v-model="form.name" class="input" placeholder="活动资料 / 收货地址" />
          </div>
          <div>
            <label class="label">说明</label>
            <input v-model="form.description" class="input" placeholder="给使用者看的说明" />
          </div>
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between gap-2">
            <div class="text-sm font-medium">字段</div>
            <button class="btn-ghost !px-3 !py-1.5" type="button" @click="addField">
              <Plus class="h-4 w-4" /> 添加字段
            </button>
          </div>

          <div v-if="form.fields.length === 0" class="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">
            还没有字段。至少添加一个输入框。
          </div>

          <div v-for="(field, index) in form.fields" :key="index" class="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <div class="grid gap-2 sm:grid-cols-12">
              <div class="sm:col-span-3">
                <label class="label">名称</label>
                <input v-model="field.label" class="input" placeholder="手机号" />
              </div>
              <div class="sm:col-span-3">
                <label class="label">key</label>
                <input v-model="field.key" class="input font-mono text-xs" placeholder="phone" />
              </div>
              <div class="sm:col-span-2">
                <label class="label">类型</label>
                <select v-model="field.type" class="input">
                  <option value="text">文本</option>
                  <option value="tel">手机号</option>
                  <option value="number">数字</option>
                  <option value="date">日期</option>
                  <option value="textarea">多行文本</option>
                  <option value="address">地址</option>
                  <option value="select">下拉选择</option>
                </select>
              </div>
              <div class="sm:col-span-3">
                <label class="label">默认值</label>
                <input v-model="field.defaultValue" class="input" placeholder="可留空" />
              </div>
              <div class="flex items-end gap-1 sm:col-span-1">
                <button class="btn-ghost !px-2 !py-2" type="button" title="上移" :disabled="index === 0" @click="moveField(index, -1)">
                  ↑
                </button>
                <button class="btn-ghost !px-2 !py-2" type="button" title="下移" :disabled="index === form.fields.length - 1" @click="moveField(index, 1)">
                  ↓
                </button>
              </div>
              <div class="sm:col-span-9">
                <label class="label">备注</label>
                <input v-model="field.note" class="input" placeholder="例如：用于活动报名" />
              </div>
              <div class="flex items-end justify-between gap-2 sm:col-span-3">
                <label class="flex items-center gap-1.5 text-xs text-slate-500">
                  <input v-model="field.required" type="checkbox" class="h-3.5 w-3.5" /> 必填
                </label>
                <button class="btn-ghost !px-2 !py-2 text-red-600 dark:text-red-300" type="button" title="删除字段" @click="removeField(index)">
                  <Trash2 class="h-4 w-4" />
                </button>
              </div>
              <div v-if="field.type === 'select'" class="space-y-2 sm:col-span-12">
                <div class="flex items-center justify-between gap-2">
                  <label class="label !mb-0">选项</label>
                  <button class="btn-ghost !px-2 !py-1 text-xs" type="button" @click="addOption(field)">
                    <Plus class="h-3.5 w-3.5" /> 添加选项
                  </button>
                </div>
                <p v-if="field.options.length === 0" class="text-xs text-slate-500">
                  还没有选项，点击“添加选项”逐个添加。
                </p>
                <div v-for="(option, optionIndex) in field.options" :key="optionIndex" class="flex items-center gap-2">
                  <input
                    v-model="field.options[optionIndex]"
                    class="input"
                    :placeholder="`选项 ${optionIndex + 1}`"
                  />
                  <button
                    class="btn-ghost !px-2 !py-2 text-red-600 dark:text-red-300"
                    type="button"
                    title="删除选项"
                    @click="removeOption(field, optionIndex)"
                  >
                    <Trash2 class="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-2">
          <button class="btn-ghost" @click="reset">清空</button>
          <button class="btn-primary" :disabled="saving" @click="save">
            <Save class="h-4 w-4" /> {{ saving ? '保存中…' : '保存表单' }}
          </button>
        </div>
      </div>
    </div>

    <div class="card text-xs text-slate-500">
      <div class="font-medium text-slate-700 dark:text-slate-200">使用方式</div>
      <ul class="mt-2 list-disc space-y-1 pl-5">
        <li>在这里定义表单字段；一个表单可以包含手机号、生日、地址等多个字段。</li>
        <li>到“账号”页选择表单并填写每个账号的真实数据。</li>
        <li>活动页会显示当前账号填写的资料，并可直接跳转到账号页编辑。</li>
      </ul>
    </div>
  </div>
</template>
