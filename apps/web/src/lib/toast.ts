import { ref } from 'vue';

export type ToastType = 'success' | 'error';

export interface ToastLink {
  to: string;
  text: string;
}

export interface ToastItem {
  id: number;
  text: string;
  type: ToastType;
  link?: ToastLink;
}

const items = ref<ToastItem[]>([]);
const timers = new Map<number, ReturnType<typeof setTimeout>>();
let nextId = 1;

function dismiss(id: number) {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  items.value = items.value.filter((item) => item.id !== id);
}

function show(text: string, type: ToastType, link?: ToastLink) {
  if (!text) return;
  const id = nextId++;
  items.value = [...items.value, { id, text, type, link }];
  const timer = setTimeout(
    () => dismiss(id),
    type === 'error' ? 6000 : 3000,
  );
  timers.set(id, timer);
  if (items.value.length > 4) {
    dismiss(items.value[0].id);
  }
}

export function useToast() {
  return {
    items,
    show,
    success: (text: string, link?: ToastLink) => show(text, 'success', link),
    error: (text: string, link?: ToastLink) => show(text, 'error', link),
    dismiss,
  };
}
