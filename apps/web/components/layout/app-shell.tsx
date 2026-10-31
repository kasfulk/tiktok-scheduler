'use client';

import {
  CalendarDays,
  ChartNoAxesCombined,
  FileText,
  LayoutDashboard,
  Library,
  ListOrdered,
  Menu,
  Settings,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { NotificationBell } from './notification-bell';
import { ThemeToggle } from './theme-toggle';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/content', label: 'Content Library', icon: Library },
  { href: '/upload', label: 'Upload Videos', icon: Upload },
  { href: '/queue', label: 'Publishing Queue', icon: ListOrdered },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/accounts', label: 'TikTok Accounts', icon: UserRound },
  { href: '/templates', label: 'Caption Templates', icon: FileText },
  { href: '/logs', label: 'Activity Logs', icon: ChartNoAxesCombined },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  user,
  children,
}: {
  user: { name: string; email: string; timezone: string };
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const active = NAV.find((item) => isActive(pathname, item.href));

  useEffect(() => setMobileOpen(false), [pathname]);

  return (
    <div className="flex min-h-dvh bg-background">
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col border-r border-border bg-card transition-transform md:static md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
              TS
            </span>
            <span className="text-sm font-semibold tracking-tight">TikTok Scheduler</span>
          </Link>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted md:hidden"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {NAV.map((item) => {
            const activeItem = active?.href === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={activeItem ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors',
                  activeItem ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                <Icon className={cn('size-4', activeItem ? 'text-foreground' : 'text-muted-foreground')} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <p className="truncate text-xs font-medium">{user.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
          <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{user.timezone}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted md:hidden"
          >
            <Menu className="size-4" />
          </button>
          <h1 className="truncate text-sm font-semibold tracking-tight">{active?.label ?? 'TikTok Scheduler'}</h1>
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 px-4 py-5 md:px-6 md:py-6">{children}</main>
      </div>
    </div>
  );
}