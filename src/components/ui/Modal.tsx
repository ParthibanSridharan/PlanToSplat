'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Slide-in drawer (right on desktop, bottom sheet on mobile) used for the asset library. */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div
      className={cn(
        'pointer-events-auto fixed z-40 flex flex-col transition-transform duration-300 ease-out',
        'inset-x-0 bottom-0 max-h-[70vh] rounded-t-3xl sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-20 sm:max-h-none sm:w-[380px] sm:rounded-3xl',
        'glass-strong',
        open ? 'translate-y-0 sm:translate-x-0' : 'translate-y-full sm:translate-x-[calc(100%+2rem)] sm:translate-y-0',
        className,
      )}
      role="dialog"
      aria-hidden={!open}
      aria-label={title}
    >
      <div className="flex items-start justify-between border-b border-white/10 p-4">
        <div>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </div>
  );
}

export default Modal;
