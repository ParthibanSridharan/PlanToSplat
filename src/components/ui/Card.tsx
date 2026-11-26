import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Analytics and quality report cards. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('glass rounded-2xl p-5', className)} {...props} />;
}

export function CardHeader({ title, subtitle, icon, action }: { title: string; subtitle?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {icon && <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/5 text-aqua-300 ring-1 ring-white/10">{icon}</div>}
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, tone = 'default', hint }: { label: string; value: ReactNode; tone?: 'default' | 'good' | 'warn' | 'bad'; hint?: string }) {
  const tones = { default: 'text-white', good: 'text-emerald-300', warn: 'text-amber-300', bad: 'text-red-300' };
  return (
    <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/5" title={hint}>
      <div className="text-[11px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={cn('mt-1 font-mono text-lg font-semibold', tones[tone])}>{value}</div>
    </div>
  );
}

export default Card;
