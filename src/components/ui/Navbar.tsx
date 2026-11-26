'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Box, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Navbar() {
  const pathname = usePathname();
  // The full-screen studio viewer has its own HUD.
  if (/^\/studio\/[^/]+/.test(pathname)) return null;
  const link = (href: string, label: string) => (
    <Link
      href={href}
      className={cn('rounded-lg px-3 py-1.5 text-sm transition', pathname === href ? 'bg-white/10 text-white' : 'text-slate-300 hover:text-white')}
    >
      {label}
    </Link>
  );
  return (
    <header className="fixed inset-x-0 top-0 z-30 px-4 pt-3">
      <nav className="glass mx-auto flex h-14 max-w-6xl items-center justify-between rounded-2xl px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-white">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-splat-500 to-aqua-500">
            <Box className="h-4 w-4" />
          </span>
          PlanToSplat <span className="text-gradient">AI</span>
        </Link>
        <div className="flex items-center gap-1">
          {link('/', 'Home')}
          {link('/studio', 'Studio')}
          <Link href="/studio/demo" className="ml-1 hidden rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/15 sm:block">
            Live demo
          </Link>
          <a href="https://github.com/graphdeco-inria/gaussian-splatting" target="_blank" rel="noreferrer" className="ml-1 hidden p-2 text-slate-400 hover:text-white md:block" title="3DGS reference implementation">
            <BookOpen className="h-4 w-4" />
          </a>
        </div>
      </nav>
    </header>
  );
}
