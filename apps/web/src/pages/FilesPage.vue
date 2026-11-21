<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowUp,
  Braces,
  ChevronRight,
  Download,
  File,
  FileCode2,
  FileText,
  Folder,
  FolderPlus,
  GitBranch,
  HardDrive,
  Home,
  Image,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-vue-next';
import { api } from '../lib/api';
import Pagination from '../components/Pagination.vue';
import CodeEditor from '../components/CodeEditor.vue';

interface FileSpace {
  id: string;
  name: string;
  kind: 'user' | 'source';
}

interface FileEntry {
  name: string;
  path: string;
  type: 'dir' | 'file';
  size: number;
  updatedAt: string;
  editable: boolean;
  previewable: boolean;
}

const route = useRoute();
const router = useRouter();

const spaces = ref<FileSpace[]>([]);
const activeSpace = ref('');
const path = ref('');
const entries = ref<FileEntry[]>([]);
const page = ref(1);
const pageSize = 50;
const loading = ref(false);
const error = ref('');
const message = ref('');

const editor = reactive({
  open: false,
  path: '',
  content: '',
  saving: false,
});

const imagePreview = reactive({
  path: '',
  url: '',
});

const uploadInput = ref<HTMLInputElement | null>(null);

const segments = computed(() => path.value.split('/').filter(Boolean));
const pagedEntries = computed(() =>
  entries.value.slice((page.value - 1) * pageSize, page.value * pageSize),
);

watch(
  () => entries.value.length,
  (total) => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page.value > totalPages) page.value = totalPages;
  },
);
const activeSpaceName = computed(
  () => spaces.value.find((space) => space.id === activeSpace.value)?.name ?? '文件空间',
);

function query(params: Record<string, string>) {
  return new URLSearchParams(params).toString();
}

function syncQuery() {
  void router.replace({
    query: {
      space: activeSpace.value || undefined,
      path: path.value || undefined,
    },
  });
}

async function loadSpaces() {
  loading.value = true;
  error.value = '';
  try {
    spaces.value = await api.get<FileSpace[]>('/files/spaces');
    const wanted = typeof route.query.space === 'string' ? route.query.space : '';
    if (wanted && spaces.value.some((space) => space.id === wanted)) {
      activeSpace.value = wanted;
    } else if (!activeSpace.value && spaces.value.length > 0) {
      activeSpace.value = spaces.value[0].id;
    }
    path.value = typeof route.query.path === 'string' ? route.query.path : '';
    await loadEntries();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载文件空间失败';
  } finally {
    loading.value = false;
  }
}

async function loadEntries() {
  if (!activeSpace.value) return;
  loading.value = true;
  error.value = '';
  try {
    const data = await api.get<{ entries: FileEntry[] }>(
      `/files/list?${query({ space: activeSpace.value, path: path.value })}`,
    );
    entries.value = data.entries;
    page.value = 1;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载目录失败';
  } finally {
    loading.value = false;
  }
}

async function selectSpace(spaceId: string) {
  activeSpace.value = spaceId;
  path.value = '';
  closeEditor();
  closeImage();
  syncQuery();
  await loadEntries();
}

async function goPath(next: string) {
  path.value = next;
  closeEditor();
  closeImage();
  syncQuery();
  await loadEntries();
}

function goUp() {
  if (!path.value) return;
  void goPath(segments.value.slice(0, -1).join('/'));
}

function openEntry(entry: FileEntry) {
  if (entry.type === 'dir') {
    void goPath(entry.path);
  } else if (entry.editable) {
    void openFile(entry);
  } else if (entry.previewable) {
    closeEditor();
    imagePreview.path = entry.path;
    imagePreview.url = downloadUrl(entry.path);
  } else {
    downloadEntry(entry);
  }
}

async function openFile(entry: FileEntry) {
  error.value = '';
  message.value = '';
  try {
    const data = await api.get<{ path: string; content: string }>(
      `/files/content?${query({ space: activeSpace.value, path: entry.path })}`,
    );
    editor.path = data.path;
    editor.content = data.content;
    editor.open = true;
    closeImage();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '读取文件失败';
  }
}

function closeEditor() {
  editor.open = false;
  editor.path = '';
  editor.content = '';
}

function closeImage() {
  imagePreview.path = '';
  imagePreview.url = '';
}

function childPath(name: string) {
  return path.value ? `${path.value}/${name}` : name;
}

function cleanName(raw: string | null): string | null {
  const name = String(raw ?? '').trim();
  if (!name) return null;
  if (name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
    error.value = '名称不能包含 / 或 \\，也不能是 . / ..';
    return null;
  }
  return name;
}

function newFile() {
  const name = cleanName(window.prompt('新建文件名（含扩展名，如 index.js）'));
  if (!name) return;
  editor.path = childPath(name);
  editor.content = '';
  editor.open = true;
  closeImage();
  message.value = '';
  error.value = '';
}

async function newFolder() {
  const name = cleanName(window.prompt('新建文件夹名'));
  if (!name) return;
  try {
    await api.post('/files/directory', { space: activeSpace.value, path: childPath(name) });
    message.value = '文件夹已创建';
    await loadEntries();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '创建文件夹失败';
  }
}

async function renameEntry(entry: FileEntry) {
  const name = cleanName(window.prompt('重命名为', entry.name));
  if (!name || name === entry.name) return;
  const parent = entry.path.split('/').slice(0, -1).join('/');
  const to = parent ? `${parent}/${name}` : name;
  try {
    await api.post('/files/rename', { space: activeSpace.value, from: entry.path, to });
    if (editor.path === entry.path) {
      editor.path = to;
    }
    message.value = '已重命名';
    await loadEntries();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '重命名失败';
  }
}

async function deleteEntry(entry: FileEntry) {
  const label = entry.type === 'dir' ? `目录「${entry.name}」及其全部内容` : `文件「${entry.name}」`;
  if (!window.confirm(`确认删除${label}？`)) return;
  try {
    await api.del(`/files?${query({ space: activeSpace.value, path: entry.path })}`);
    if (editor.path === entry.path || editor.path.startsWith(`${entry.path}/`)) closeEditor();
    if (imagePreview.path === entry.path || imagePreview.path.startsWith(`${entry.path}/`)) closeImage();
    message.value = '已删除';
    await loadEntries();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除失败';
  }
}

async function saveFile() {
  if (!editor.path) return;
  error.value = '';
  message.value = '';
  editor.saving = true;
  try {
    await api.put('/files/content', {
      space: activeSpace.value,
      path: editor.path,
      content: editor.content,
    });
    message.value = `已保存 ${editor.path}`;
    await loadEntries();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败';
  } finally {
    editor.saving = false;
  }
}

function downloadUrl(filePath: string) {
  return `/api/v1/files/download?${query({ space: activeSpace.value, path: filePath })}`;
}

function downloadEntry(entry: FileEntry) {
  const link = document.createElement('a');
  link.href = downloadUrl(entry.path);
  link.download = entry.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function pickUpload() {
  uploadInput.value?.click();
}

async function uploadFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    error.value = '单个文件不能超过 2MB';
    return;
  }
  error.value = '';
  message.value = '';
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'));
      reader.readAsDataURL(file);
    });
    const base64 = dataUrl.split(',')[1] ?? '';
    await api.post('/files/upload', {
      space: activeSpace.value,
      path: childPath(file.name),
      dataBase64: base64,
    });
    message.value = `已上传 ${file.name}`;
    await loadEntries();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '上传失败';
  }
}

function reload() {
  void loadEntries();
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false });
}

function entryIcon(entry: FileEntry) {
  if (entry.type === 'dir') return Folder;
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'json') return Braces;
  if (['js', 'ts', 'mjs', 'cjs'].includes(ext)) return FileCode2;
  if (entry.previewable) return Image;
  if (entry.editable) return FileText;
  return File;
}

function entryIconClass(entry: FileEntry) {
  if (entry.type === 'dir') return 'text-amber-500';
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'json') return 'text-amber-400';
  if (['js', 'mjs', 'cjs'].includes(ext)) return 'text-yellow-400';
  if (ext === 'ts') return 'text-sky-400';
  if (ext === 'md') return 'text-sky-500';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) return 'text-purple-400';
  return 'text-slate-400';
}

function editorLanguage(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'json') return 'JSON';
  if (['js', 'mjs', 'cjs'].includes(ext)) return 'JavaScript';
  if (ext === 'ts') return 'TypeScript';
  if (ext === 'md') return 'Markdown';
  return ext ? ext.toUpperCase() : 'Text';
}

function editorLanguageKey(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'json') return 'json';
  if (['js', 'mjs', 'cjs'].includes(ext)) return 'javascript';
  if (ext === 'ts') return 'typescript';
  return 'text';
}

onMounted(loadSpaces);
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 class="text-lg font-semibold">文件管理</h2>
        <p class="text-sm text-slate-500">用户空间和订阅源目录；查看、编辑、新建、上传、重命名、删除。</p>
      </div>
      <button class="btn-ghost !px-3 !py-1.5" @click="reload">
        <RefreshCw class="h-4 w-4" /> 刷新
      </button>
    </div>

    <p v-if="error" class="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{{ error }}</p>
    <p v-if="message" class="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">{{ message }}</p>

    <div class="card">
      <div class="flex flex-wrap gap-2">
        <button
          v-for="space in spaces"
          :key="space.id"
          class="flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition"
          :class="
            activeSpace === space.id
              ? 'bg-brand-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
          "
          @click="selectSpace(space.id)"
        >
          <HardDrive v-if="space.kind === 'user'" class="h-4 w-4" />
          <GitBranch v-else class="h-4 w-4" />
          {{ space.name }}
        </button>
        <span v-if="spaces.length === 0" class="text-sm text-slate-500">还没有文件空间。</span>
      </div>
    </div>

    <div class="card space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-1 text-sm">
          <button class="flex items-center gap-1 rounded-lg px-2 py-1 text-brand-600 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-900/30" @click="goPath('')">
            <Home class="h-4 w-4" /> {{ activeSpaceName }}
          </button>
          <template v-for="(segment, index) in segments" :key="index">
            <ChevronRight class="h-3.5 w-3.5 text-slate-400" />
            <button class="rounded-lg px-2 py-1 font-mono text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" @click="goPath(segments.slice(0, index + 1).join('/'))">
              {{ segment }}
            </button>
          </template>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="btn-ghost !px-3 !py-1.5" :disabled="!path" @click="goUp">
            <ArrowUp class="h-4 w-4" /> 上一级
          </button>
          <button class="btn-ghost !px-3 !py-1.5" @click="newFile">
            <Plus class="h-4 w-4" /> 新建文件
          </button>
          <button class="btn-ghost !px-3 !py-1.5" @click="newFolder">
            <FolderPlus class="h-4 w-4" /> 新建文件夹
          </button>
          <button class="btn-ghost !px-3 !py-1.5" @click="pickUpload">
            <Upload class="h-4 w-4" /> 上传
          </button>
          <input ref="uploadInput" type="file" class="hidden" @change="uploadFile" />
        </div>
      </div>

      <div v-if="loading" class="py-10 text-center text-sm text-slate-500">加载中…</div>
      <div v-else-if="entries.length === 0" class="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500 dark:border-slate-700">
        这个目录是空的。
      </div>
      <div v-else class="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        <div v-for="entry in pagedEntries" :key="entry.path" class="flex items-center gap-3 px-3 py-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/60">
          <component :is="entryIcon(entry)" class="h-5 w-5 shrink-0" :class="entryIconClass(entry)" />
          <button class="min-w-0 flex-1 text-left" @click="openEntry(entry)">
            <div class="truncate text-sm">{{ entry.name }}</div>
            <div class="text-xs text-slate-500">
              {{ entry.type === 'dir' ? '目录' : formatBytes(entry.size) }} · {{ formatTime(entry.updatedAt) }}
            </div>
          </button>
          <div class="flex shrink-0 items-center gap-1">
            <button
              v-if="entry.type === 'file' && entry.editable"
              class="btn-ghost !px-2 !py-1"
              title="编辑"
              @click="openFile(entry)"
            >
              <Pencil class="h-4 w-4" />
            </button>
            <button v-if="entry.type === 'file'" class="btn-ghost !px-2 !py-1" title="下载" @click="downloadEntry(entry)">
              <Download class="h-4 w-4" />
            </button>
            <button class="btn-ghost !px-2 !py-1" title="重命名" @click="renameEntry(entry)">
              <span class="hidden text-xs sm:inline">重命名</span>
              <Pencil class="h-4 w-4 sm:hidden" />
            </button>
            <button class="btn-ghost !px-2 !py-1 text-red-600 dark:text-red-300" title="删除" @click="deleteEntry(entry)">
              <Trash2 class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      <Pagination :page="page" :total="entries.length" :page-size="pageSize" unit="个文件" @update:page="page = $event" />
    </div>

    <div v-if="editor.open" class="card space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="font-mono text-xs text-slate-500">{{ editor.path }}</div>
        <div class="flex gap-2">
          <button class="btn-ghost !px-3 !py-1.5" @click="closeEditor">
            <X class="h-4 w-4" /> 关闭
          </button>
          <button class="btn-primary !px-3 !py-1.5" :disabled="editor.saving" @click="saveFile">
            <Save class="h-4 w-4" /> {{ editor.saving ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>
      <div class="overflow-hidden rounded-xl border border-slate-700 bg-[#1e1e1e] shadow-inner">
        <div class="flex items-center justify-between border-b border-slate-700 px-3 py-2 text-[11px] text-slate-400">
          <span class="truncate font-mono">{{ editor.path }}</span>
          <span>{{ editorLanguage(editor.path) }}</span>
        </div>
        <div class="h-[28rem]">
          <CodeEditor v-model="editor.content" :language="editorLanguageKey(editor.path)" />
        </div>
        <div class="flex items-center justify-between border-t border-slate-700 px-3 py-1.5 text-[11px] text-slate-400">
          <span>UTF-8 · LF</span>
          <span>{{ editor.content.length }} 字符 · {{ editorLanguage(editor.path) }}</span>
        </div>
      </div>
    </div>

    <div v-if="imagePreview.url" class="card space-y-2">
      <div class="flex items-center justify-between gap-2">
        <div class="font-mono text-xs text-slate-500">{{ imagePreview.path }}</div>
        <button class="btn-ghost !px-3 !py-1.5" @click="closeImage">
          <X class="h-4 w-4" /> 关闭
        </button>
      </div>
      <img :src="imagePreview.url" :alt="imagePreview.path" class="max-h-[70vh] max-w-full rounded-xl object-contain" />
    </div>
  </div>
</template>
