import { ref } from 'vue';
import { api, type ClockData } from '../lib/api';

const data = ref<ClockData | null>(null);
const loading = ref(false);
const error = ref('');
const current = ref(new Date());

let loadedAt = 0;
let loadTimer: number | null = null;
let tickTimer: number | null = null;

function computeNow(): Date {
  if (!data.value) return new Date();
  return new Date(Date.parse(data.value.now) + (performance.now() - loadedAt));
}

async function load() {
  loading.value = true;
  try {
    data.value = await api.get<ClockData>('/clock');
    loadedAt = performance.now();
    current.value = computeNow();
    error.value = '';
  } catch (e) {
    error.value = e instanceof Error ? e.message : '时间加载失败';
  } finally {
    loading.value = false;
  }
}

function tick() {
  current.value = computeNow();
}

function start() {
  if (tickTimer === null) {
    tick();
    tickTimer = window.setInterval(tick, 1000);
  }
  if (loadTimer === null) {
    void load();
    loadTimer = window.setInterval(() => void load(), 10_000);
  }
}

function stop() {
  if (tickTimer !== null) window.clearInterval(tickTimer);
  if (loadTimer !== null) window.clearInterval(loadTimer);
  tickTimer = null;
  loadTimer = null;
}

export function useClock() {
  return { data, loading, error, current, load, start, stop };
}
