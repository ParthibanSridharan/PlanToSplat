import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'glass' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  active?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-gradient-to-r from-splat-500 to-aqua-500 text-white shadow-lg shadow-splat-500/25 hover:brightness-110 active:brightness-95',
  glass: 'glass text-slate-100 hover:bg-white/10',
  ghost: 'text-slate-300 hover:bg-white/10 hover:text-white',
  danger: 'bg-red-500/15 text-red-200 ring-1 ring-red-400/30 hover:bg-red-500/25',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2 rounded-xl',
  icon: 'h-10 w-10 rounded-xl',
};

/** Glassmorphic UI action button. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'glass', size = 'md', active, className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua-400/70 disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        active && 'bg-splat-500/30 text-white ring-1 ring-splat-400/60',
        className,
      )}
      {...props}
    />
  );
});

export default Button;
