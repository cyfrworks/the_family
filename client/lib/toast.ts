export type ToastType = 'success' | 'error' | 'info';

type Listener = (type: ToastType, message: string) => void;

const listeners = new Set<Listener>();

export const toastEmitter = {
  on(fn: Listener) { listeners.add(fn); },
  off(fn: Listener) { listeners.delete(fn); },
  emit(type: ToastType, message: string) { listeners.forEach((fn) => fn(type, message)); },
};

export const toast = {
  success(message: string) { toastEmitter.emit('success', message); },
  error(message: string) { toastEmitter.emit('error', message); },
  info(message: string) { toastEmitter.emit('info', message); },
};

export function showToast({ type, text1 }: { type: ToastType; text1: string; text2?: string }) {
  toastEmitter.emit(type, text1);
}
