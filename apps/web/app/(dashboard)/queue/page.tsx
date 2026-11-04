'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pause, Play, RefreshCw, X, Calendar, Clock, AlertCircle, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiFetch, queryKeys, ApiClientError } from '@/lib/api-client';
import type { QueueResponse, QueueItemDto, GenerateCaptionResult } from '@/lib/types';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog, Dialog, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Input, Textarea, Label } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/progress';
import { EmptyState, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';


export default function QueuePage() {
  const queryClient = useQueryClient();
  const [confirmPause, setConfirmPause] = useState(false);
  const [rescheduleItem, setRescheduleItem] = useState<QueueItemDto | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<QueueItemDto | null>(null);
  const [captionItem, setCaptionItem] = useState<QueueItemDto | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.queue,
    queryFn: () => apiFetch<QueueResponse>('/api/queue'),
    refetchInterval: (query) => {
      const response = query.state.data;
      if (!response) return 10_000;
      const hasActiveWork = response.counts.active > 0 || response.counts.waiting > 0 || response.counts.delayed > 0;
      return hasActiveWork ? 10_000 : false;
    },
  });

  const pauseMutation = useMutation({
    mutationFn: () => apiFetch<{ paused: boolean }>('/api/queue/pause', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.queue });
      toast.success('Queue paused');
    },
    onError: (error: ApiClientError) => toast.error(error.message),
  });

  const resumeMutation = useMutation({
    mutationFn: () => apiFetch<{ paused: boolean }>('/api/queue/resume', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.queue });
      toast.success('Queue resumed');
    },
    onError: (error: ApiClientError) => toast.error(error.message),
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/queue/retry/${id}`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.queue });
      toast.success('Job queued for retry');
    },
    onError: (error: ApiClientError) => toast.error(error.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/schedules/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.queue });
      queryClient.invalidateQueries({ queryKey: queryKeys.schedules() });
      toast.success('Post cancelled');
    },
    onError: (error: ApiClientError) => toast.error(error.message),
  });

  const sortedItems = data?.items.slice().sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()) ?? [];

  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Publishing Queue</h1>
        </div>
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<AlertCircle />}
              title="Failed to load queue"
              description={error instanceof ApiClientError ? error.message : 'An unexpected error occurred'}
              action={<Button onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.queue })}>Retry</Button>}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Publishing Queue</h1>
        {data && (
          <div className="flex items-center gap-2">
            {data.paused && <Badge variant="warning">Paused</Badge>}
            <Button
              variant={data.paused ? 'default' : 'outline'}
              size="sm"
              onClick={() => (data.paused ? resumeMutation.mutate() : setConfirmPause(true))}
              disabled={pauseMutation.isPending || resumeMutation.isPending}
            >
              {data.paused ? <Play /> : <Pause />}
              {data.paused ? 'Resume' : 'Pause'}
            </Button>
          </div>
        )}
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatPill label="Active" value={data.counts.active} />
          <StatPill label="Waiting" value={data.counts.waiting} />
          <StatPill label="Delayed" value={data.counts.delayed} />
          <StatPill label="Completed" value={data.counts.completed} />
          <StatPill label="Failed" value={data.counts.failed} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Upcoming</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <QueueSkeleton />
          ) : sortedItems.length === 0 ? (
            <EmptyState
              icon={<Calendar />}
              title="Nothing queued yet"
              description="Posts will appear here once they're scheduled and ready to publish."
              action={
                <Link href="/calendar" className={buttonVariants()}>
                  <Calendar />
                  Go to calendar
                </Link>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Video</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Retries</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedItems.map((item) => (
                  <QueueRow
                    key={item.id}
                    item={item}
                    onRetry={() => retryMutation.mutate(item.id)}
                    onCancel={() => setConfirmCancel(item)}
                    onReschedule={() => setRescheduleItem(item)}
                    onGenerateCaption={() => setCaptionItem(item)}
                    retrying={retryMutation.isPending}
                    cancelling={cancelMutation.isPending}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmPause}
        onOpenChange={setConfirmPause}
        title="Pause publishing queue?"
        description="Queued jobs will stop publishing until you resume the queue. Posts already in progress will finish."
        confirmLabel="Pause queue"
        onConfirm={() => {
          pauseMutation.mutate();
          setConfirmPause(false);
        }}
        pending={pauseMutation.isPending}
      />

      <ConfirmDialog
        open={!!confirmCancel}
        onOpenChange={(open) => !open && setConfirmCancel(null)}
        title="Cancel scheduled post?"
        description="This will remove the post from the queue. You can reschedule it later from the calendar."
        confirmLabel="Cancel post"
        onConfirm={() => {
          if (confirmCancel) {
            cancelMutation.mutate(confirmCancel.id);
            setConfirmCancel(null);
          }
        }}
        pending={cancelMutation.isPending}
      />

      {rescheduleItem && (
        <RescheduleDialog
          item={rescheduleItem}
          onClose={() => setRescheduleItem(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: queryKeys.queue });
            queryClient.invalidateQueries({ queryKey: queryKeys.schedules() });
          }}
        />
      )}
      {captionItem && (
        <GenerateCaptionDialog
          item={captionItem}
          onClose={() => setCaptionItem(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: queryKeys.queue });
            queryClient.invalidateQueries({ queryKey: queryKeys.videos() });
            queryClient.invalidateQueries({ queryKey: queryKeys.video(captionItem.videoId) });
          }}
        />
      )}
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular">{value}</div>
    </div>
  );
}

function QueueRow({
  item,
  onRetry,
  onCancel,
  onReschedule,
  onGenerateCaption,
  retrying,
  cancelling,
}: {
  item: QueueItemDto;
  onRetry: () => void;
  onCancel: () => void;
  onReschedule: () => void;
  onGenerateCaption: () => void;
  retrying: boolean;
  cancelling: boolean;
}) {
  const scheduledDate = new Date(item.scheduledAt);
  const canRetry = item.status === 'FAILED' || item.status === 'MANUAL_ACTION_REQUIRED';
  const canCancel = item.status === 'PENDING' || item.status === 'QUEUED';

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          {item.thumbnailUrl ? (
            <img src={item.thumbnailUrl} alt="" className="size-10 rounded-md object-cover" />
          ) : (
            <div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Clock className="size-4" />
            </div>
          )}
          <div className="min-w-0">
            <span className="block max-w-[200px] truncate text-sm font-medium">{item.videoTitle}</span>
            {item.caption ? <span className="block max-w-[200px] truncate text-[11px] text-muted-foreground">{item.caption}</span> : null}
          </div>
        </div>
      </TableCell>
      <TableCell className="text-sm">{item.accountUsername}</TableCell>
      <TableCell className="text-sm tabular">
        {scheduledDate.toLocaleDateString()} {scheduledDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </TableCell>
      <TableCell>
        <StatusBadge status={item.status} />
      </TableCell>
      <TableCell className="text-sm tabular">
        {item.retryCount}
      </TableCell>
      <TableCell className="max-w-[200px] text-sm text-muted-foreground">
        {item.errorMessage ? (
          <span className="truncate block" title={item.errorMessage}>
            {item.errorMessage}
          </span>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          {canRetry && (
            <Button variant="ghost" size="sm" onClick={onRetry} disabled={retrying}>
              <RefreshCw />
              Retry
            </Button>
          )}
          {canCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={cancelling} className="text-error hover:text-error">
              <X />
              Cancel
            </Button>
          )}
          {canCancel && (
            <Button variant="ghost" size="sm" onClick={onReschedule}>
              Reschedule
            </Button>
          )}
          {item.status !== 'CANCELLED' && (
            <Button variant="ghost" size="sm" onClick={onGenerateCaption}>
              <Sparkles />
              Caption
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function QueueSkeleton() {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

function RescheduleDialog({
  item,
  onClose,
  onSaved,
}: {
  item: QueueItemDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [dateTime, setDateTime] = useState(() => {
    const date = new Date(item.scheduledAt);
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60_000);
    return local.toISOString().slice(0, 16);
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const scheduledAt = new Date(dateTime).toISOString();
      await apiFetch(`/api/schedules/${item.id}`, {
        method: 'PATCH',
        json: { scheduledAt },
      });
      toast.success('Post rescheduled');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to reschedule');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogHeader>
        <DialogTitle>Reschedule post</DialogTitle>
        <DialogDescription>Choose a new date and time for "{item.videoTitle}"</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit}>
        <DialogBody>
          <div className="space-y-2">
            <Label htmlFor="reschedule-datetime">New date and time</Label>
            <Input
              id="reschedule-datetime"
              type="datetime-local"
              value={dateTime}
              onChange={(e) => setDateTime(e.target.value)}
              required
            />
            {error && <p className="text-xs text-error">{error}</p>}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function GenerateCaptionDialog({
  item,
  onClose,
  onSaved,
}: {
  item: QueueItemDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [generating, setGenerating] = useState(true);
  const [saving, setSaving] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [regen, setRegen] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const generate = async () => {
      setGenerating(true);
      setGenError(null);
      setModel(null);
      try {
        const result = await apiFetch<GenerateCaptionResult>(`/api/videos/${item.videoId}/caption/generate`, {
          method: 'POST',
          json: {},
        });
        if (cancelled) return;
        setCaption(result.caption);
        setHashtags(result.hashtags);
        setModel(result.model);
      } catch (err) {
        if (!cancelled) setGenError(err instanceof ApiClientError ? err.message : 'Failed to generate caption');
      } finally {
        if (!cancelled) setGenerating(false);
      }
    };
    generate();
    return () => {
      cancelled = true;
    };
  }, [item.videoId, regen]);

  const handleSave = async () => {
    setSaving(true);
    setGenError(null);
    try {
      await apiFetch(`/api/videos/${item.videoId}`, {
        method: 'PATCH',
        json: { caption: caption.trim() || null, hashtags: hashtags.trim() || null },
      });
      toast.success('Caption saved');
      onSaved();
      onClose();
    } catch (err) {
      setGenError(err instanceof ApiClientError ? err.message : 'Failed to save the caption');
    } finally {
      setSaving(false);
    }
  };

  const busy = generating || saving;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogHeader>
        <DialogTitle>Generate caption</DialogTitle>
        <DialogDescription>Generate a caption for "{item.videoTitle}"</DialogDescription>
      </DialogHeader>
      <DialogBody>
        {generating ? (
          <p className="text-xs text-muted-foreground">Generating caption from the thumbnail…</p>
        ) : (
          <div className="space-y-2">
            {genError && <p className="text-xs text-error">{genError}</p>}
            {!genError && item.caption ? (
              <p className="text-xs text-muted-foreground">Current caption: {item.caption}</p>
            ) : null}
            <div className="space-y-1">
              <Label htmlFor="caption-captions">Caption</Label>
              <Textarea
                id="caption-captions"
                rows={5}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="caption-hashtags">Hashtags</Label>
              <Input
                id="caption-hashtags"
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
                disabled={busy}
              />
            </div>
            {model && <p className="text-xs text-muted-foreground">Generated by {model}</p>}
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={() => setRegen((n) => n + 1)} disabled={busy}>
          Regenerate
        </Button>
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={busy || (!caption.trim() && !hashtags.trim())}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
