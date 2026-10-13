import React, { useEffect } from 'react';
import { CheckCircle2, Sparkles, X, AlertTriangle } from 'lucide-react';

export interface ToastNotification {
  id: string;
  type: 'success' | 'warning' | 'info';
  title: string;
  message: string;
}

interface NotificationToastProps {
  toasts: ToastNotification[];
  onDismiss: (id: string) => void;
}

export const NotificationToast: React.FC<NotificationToastProps> = ({
  toasts,
  onDismiss,
}) => {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto p-3.5 rounded-2xl shadow-xl border backdrop-blur-md flex items-start gap-3 animate-in slide-in-from-bottom-5 duration-200 ${
            toast.type === 'success'
              ? 'bg-slate-900/95 border-emerald-500/40 text-slate-100 ring-1 ring-emerald-500/20'
              : toast.type === 'warning'
              ? 'bg-slate-900/95 border-amber-500/40 text-slate-100 ring-1 ring-amber-500/20'
              : 'bg-slate-900/95 border-indigo-500/40 text-slate-100 ring-1 ring-indigo-500/20'
          }`}
        >
          {toast.type === 'success' ? (
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          ) : toast.type === 'warning' ? (
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
          ) : (
            <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-white truncate">{toast.title}</h4>
            <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">{toast.message}</p>
          </div>

          <button
            onClick={() => onDismiss(toast.id)}
            className="p-1 rounded-md text-slate-400 hover:text-white transition flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
