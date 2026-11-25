import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useNocturne } from '../context/NocturneContext';

export function ToastContainer() {
  const { toasts, dismissToast } = useNocturne();
  if (!toasts.length) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-4 right-4 z-[80] flex flex-col gap-2 max-w-xs w-full pointer-events-none"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-[#161622]/95 backdrop-blur-xl border border-purple-400/25 shadow-lg text-xs font-medium text-zinc-100"
        >
          {toast.tone === 'success' && <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" aria-hidden="true" />}
          {toast.tone === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" aria-hidden="true" />}
          {toast.tone === 'info' && <Info className="w-4 h-4 text-purple-300 shrink-0" aria-hidden="true" />}
          <span className="flex-1">{toast.text}</span>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss notification"
            className="text-zinc-400 hover:text-white p-1"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
