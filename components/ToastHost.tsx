import React, { useEffect, useState } from 'react';
import { CheckCircle2, Info, XCircle } from 'lucide-react';
import { getToastEventName, ToastPayload } from '../services/toast';

type ToastItem = {
  id: string;
  message: string;
  level: 'success' | 'error' | 'info';
};

const levelStyles: Record<ToastItem['level'], string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-rose-200 bg-rose-50 text-rose-800',
  info: 'border-slate-200 bg-white text-slate-800',
};

const ToastHost: React.FC = () => {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const eventName = getToastEventName();
    const onToast = (ev: Event) => {
      const payload = (ev as CustomEvent<ToastPayload>).detail;
      if (!payload?.message) return;
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const next: ToastItem = {
        id,
        message: payload.message,
        level: payload.level ?? 'success',
      };
      setItems(prev => [...prev, next]);
      window.setTimeout(() => {
        setItems(prev => prev.filter(t => t.id !== id));
      }, 2400);
    };
    window.addEventListener(eventName, onToast as EventListener);
    return () => window.removeEventListener(eventName, onToast as EventListener);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed right-4 top-4 z-[120] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {items.map(item => (
        <div
          key={item.id}
          className={`rounded-xl border px-3 py-2 text-sm shadow-lg backdrop-blur-sm ${levelStyles[item.level]}`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-2">
            {item.level === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : item.level === 'error' ? (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>{item.message}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ToastHost;

