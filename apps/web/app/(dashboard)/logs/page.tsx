'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Paginated } from '@tiktok-scheduler/shared';

import { apiFetch } from '@/lib/api-client';
import type { PublishingLogDto } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

const EVENT_COLORS: Record<string, 'success' | 'error' | 'warning' | 'info' | 'muted' | 'outline'> = {
  publish_success: 'success',
  published: 'success',
  publish_failed: 'error',
  failed: 'error',
  error: 'error',
  retry: 'warning',
  queued: 'info',
  scheduled: 'info',
  cancelled: 'muted',
};

function getEventVariant(event: string): 'success' | 'error' | 'warning' | 'info' | 'muted' | 'outline' {
  const lower = event.toLowerCase();
  for (const [prefix, variant] of Object.entries(EVENT_COLORS)) {
    if (lower.includes(prefix)) return variant;
  }
  if (lower.includes('success')) return 'success';
  if (lower.includes('fail') || lower.includes('error')) return 'error';
  if (lower.includes('warn') || lower.includes('retry')) return 'warning';
  if (lower.includes('queue') || lower.includes('schedule')) return 'info';
  return 'outline';
}

export default function LogsPage() {
  const [page, setPage] = useState(1);
  const [eventFilter, setEventFilter] = useState('');
  const pageSize = 25;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['logs', page, pageSize, eventFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (eventFilter) params.set('event', eventFilter);
      return apiFetch<Paginated<PublishingLogDto>>(`/api/logs?${params.toString()}`);
    },
  });

  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Activity Logs</h1>
          <p className="text-xs text-muted-foreground">Publishing events and errors.</p>
        </div>
        <Card>
          <CardContent className="space-y-2 py-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Activity Logs</h1>
          <p className="text-xs text-muted-foreground">Publishing events and errors.</p>
        </div>
        <Card>
          <CardContent className="py-8 text-center text-xs text-error">
            Failed to load logs.
          </CardContent>
        </Card>
      </div>
    );
  }

  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Activity Logs</h1>
          <p className="text-xs text-muted-foreground">Publishing events and errors.</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="event-filter">Filter by event</Label>
          <Input
            id="event-filter"
            placeholder="e.g. publish_failed"
            value={eventFilter}
            onChange={(e) => {
              setEventFilter(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <Card>
        {items.length === 0 ? (
          <EmptyState
            title="No logs found"
            description={eventFilter ? 'Try a different filter.' : 'Logs will appear here as posts are scheduled and published.'}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Video</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((log) => (
                <LogRow
                  key={log.id}
                  log={log}
                  expanded={expandedRow === log.id}
                  onToggle={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                />
              ))}
            </TableBody>
          </Table>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground tabular">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function LogRow({
  log,
  expanded,
  onToggle,
}: {
  log: PublishingLogDto;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasMetadata = log.requestMetadata || log.responseMetadata;

  return (
    <>
      <TableRow
        className={cn(hasMetadata && 'cursor-pointer')}
        onClick={hasMetadata ? onToggle : undefined}
      >
        <TableCell className="tabular text-xs text-muted-foreground">
          {new Date(log.createdAt).toLocaleString()}
        </TableCell>
        <TableCell>
          <Badge variant={getEventVariant(log.event)}>{log.event}</Badge>
        </TableCell>
        <TableCell className="max-w-[200px] truncate text-xs">
          {log.videoTitle ?? '—'}
        </TableCell>
        <TableCell className="text-xs">
          {log.accountUsername ?? '—'}
        </TableCell>
        <TableCell className="max-w-[200px] truncate text-xs text-error">
          {log.errorMessage ?? '—'}
        </TableCell>
      </TableRow>
      {expanded && hasMetadata ? (
        <TableRow>
          <TableCell colSpan={5} className="bg-muted/40">
            <div className="space-y-2">
              {log.requestMetadata ? (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Request
                  </p>
                  <pre className="mt-1 overflow-x-auto rounded-md border border-border bg-card p-2 font-mono text-[11px]">
                    {formatJson(log.requestMetadata)}
                  </pre>
                </div>
              ) : null}
              {log.responseMetadata ? (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Response
                  </p>
                  <pre className="mt-1 overflow-x-auto rounded-md border border-border bg-card p-2 font-mono text-[11px]">
                    {formatJson(log.responseMetadata)}
                  </pre>
                </div>
              ) : null}
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function formatJson(value: string | null): string {
  if (!value) return '—';
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}
