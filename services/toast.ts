export type ToastLevel = 'success' | 'error' | 'info';

export type ToastPayload = {
  message: string;
  level?: ToastLevel;
};

const TOAST_EVENT = 'app:toast';

export function toast(message: string, level: ToastLevel = 'success') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT, { detail: { message, level } }));
}

export function getToastEventName() {
  return TOAST_EVENT;
}

