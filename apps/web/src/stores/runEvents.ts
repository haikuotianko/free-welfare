import { ref } from 'vue';
import type { Run } from '../lib/api';

export interface RunLogEvent {
  id: string;
  runId: string;
  ts: string;
  level: string;
  message: string;
  data?: unknown;
}

export type RunStreamEvent =
  | { type: 'run'; data: Run }
  | { type: 'log'; data: RunLogEvent }
  | { type: 'sync'; data: { at: string } }
  | { type: 'ping'; data: { at: string } };

type Handler = (event: RunStreamEvent) => void;

const handlers = new Set<Handler>();
const connected = ref(false);
let source: EventSource | null = null;
let retryTimer: number | null = null;

function dispatch(type: string, raw: string) {
  if (type === 'ping') {
    connected.value = true;
    return;
  }
  if (type !== 'run' && type !== 'log' && type !== 'sync') return;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }
  for (const handler of handlers) handler({ type, data } as RunStreamEvent);
}

function open() {
  if (source || handlers.size === 0) return;
  source = new EventSource('/api/v1/runs/stream', { withCredentials: true });
  source.onopen = () => {
    connected.value = true;
  };
  source.onerror = () => {
    connected.value = false;
    if (source && source.readyState === EventSource.CLOSED) {
      source = null;
      if (retryTimer) window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        open();
      }, 3000);
    }
  };
  source.addEventListener('run', (event) => dispatch('run', (event as MessageEvent).data));
  source.addEventListener('log', (event) => dispatch('log', (event as MessageEvent).data));
  source.addEventListener('sync', (event) => dispatch('sync', (event as MessageEvent).data));
  source.addEventListener('ping', (event) => dispatch('ping', (event as MessageEvent).data));
}

/** 订阅运行事件；多个页面共用一条 SSE 连接。返回取消订阅函数。 */
export function subscribeRunEvents(handler: Handler) {
  handlers.add(handler);
  open();
  return () => {
    handlers.delete(handler);
    if (handlers.size === 0) {
      source?.close();
      source = null;
      connected.value = false;
      if (retryTimer) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
    }
  };
}

export { connected as runEventsConnected };
