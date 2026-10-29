import { useEffect, useState, createContext, useContext, useCallback } from 'react';
import { X, Loader2, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { errorMessage } from '../lib/utils.js';

export function Spinner({ className = '' }) {
  return <Loader2 className={`animate-spin ${className}`} size={18} />;
}

export function PageLoader({ text = 'Đang tải…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
      <Spinner /> {text}
    </div>
  );
}

export function Badge({ className = '', children }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${className}`}>{children}</span>;
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center text-slate-500">
      {Icon && <Icon size={40} className="text-slate-300" />}
      <p className="font-medium text-slate-600">{title}</p>
      {children && <div className="text-sm">{children}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, size = 'max-w-2xl' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={`flex max-h-[92vh] w-full ${size} flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Đóng">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function StatCard({ icon: Icon, label, value, color = 'text-blue-700 bg-blue-50', sub }) {
  return (
    <div className="card flex items-center gap-4 p-4">
      <div className={`rounded-xl p-3 ${color}`}>{Icon && <Icon size={22} />}</div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-slate-900">{value}</div>
        <div className="text-sm leading-snug text-slate-500">{label}</div>
        {sub && <div className="text-xs text-slate-400">{sub}</div>}
      </div>
    </div>
  );
}

// ---------- Thông báo nhỏ (toast) ----------
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setItems((l) => [...l, { id, message, type }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), type === 'error' ? 7000 : 3500);
  }, []);
  const icons = { success: CheckCircle2, error: AlertTriangle, info: Info };
  const colors = { success: 'bg-emerald-600', error: 'bg-red-600', info: 'bg-slate-800' };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="no-print fixed right-4 bottom-4 z-[60] flex max-w-sm flex-col gap-2">
        {items.map((t) => {
          const Icon = icons[t.type] || Info;
          return (
            <div key={t.id} className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm text-white shadow-lg ${colors[t.type]}`}>
              <Icon size={18} className="mt-0.5 shrink-0" />
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export function useAsync() {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const run = useCallback(
    async (fn, successMsg) => {
      setBusy(true);
      try {
        const r = await fn();
        if (successMsg) toast(successMsg);
        return r;
      } catch (e) {
        toast(errorMessage(e), 'error');
        console.error(e);
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [toast]
  );
  return [busy, run];
}
