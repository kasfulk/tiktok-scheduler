'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellRing, Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { apiFetch, queryKeys } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
}

interface NotificationPage {
  items: NotificationItem[];
  total: number;
  unread: number;
}

export function NotificationBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: queryKeys.notifications(false),
    queryFn: () => apiFetch<NotificationPage>('/api/notifications?pageSize=10'),
    refetchInterval: 60_000,
  });

  const markRead = useMutation({
    mutationFn: () => apiFetch<{ updated: number }>('/api/notifications/read', { method: 'POST', json: {} }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const unread = data?.unread ?? 0;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {unread > 0 ? <BellRing className="size-4" /> : <Bell className="size-4" />}
        {unread > 0 ? (
          <span className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-error text-[9px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-lg border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-xs font-semibold">Notifications</p>
            <button
              type="button"
              disabled={unread === 0 || markRead.isPending}
              onClick={() => markRead.mutate()}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <Check className="size-3" /> Mark all read
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {data && data.items.length > 0 ? (
              data.items.map((item) => (
                <div
                  key={item.id}
                  className={cn('border-b border-border/60 px-3 py-2.5 last:border-0', !item.readAt && 'bg-muted/30')}
                >
                  <p className="text-xs font-medium">{item.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{item.message}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
              ))
            ) : (
              <p className="px-3 py-8 text-center text-xs text-muted-foreground">Nothing yet.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}