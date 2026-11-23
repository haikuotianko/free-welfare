import { onMounted, onUnmounted } from 'vue';

interface EscapeLayer {
  close: () => void;
  enabled: () => boolean;
}

const layers: EscapeLayer[] = [];
let listening = false;

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.isComposing) return;
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];
    if (!layer.enabled()) continue;
    event.preventDefault();
    layer.close();
    return;
  }
}

/**
 * 弹窗打开时按 Esc 等价于点击关闭。只关闭最上层弹窗，避免嵌套弹窗一起关闭。
 */
export function useEscapeClose(close: () => void, enabled: () => boolean = () => true) {
  const layer: EscapeLayer = { close, enabled };

  onMounted(() => {
    layers.push(layer);
    if (!listening) {
      window.addEventListener('keydown', handleKeydown);
      listening = true;
    }
  });

  onUnmounted(() => {
    const index = layers.indexOf(layer);
    if (index >= 0) layers.splice(index, 1);
    if (layers.length === 0 && listening) {
      window.removeEventListener('keydown', handleKeydown);
      listening = false;
    }
  });
}
