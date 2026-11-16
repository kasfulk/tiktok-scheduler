'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Calendar } from 'lucide-react';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogBody } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ApiClientError, apiFetch, queryKeys } from '@/lib/api-client';
import type { AccountDto, SessionUserDto, VideoDto } from '@/lib/types';
import {
  formatLocalDate,
  formatLocalTime,
  localDateTimeToUtc,
  type ScheduledPostStatus,
} from '@tiktok-scheduler/shared';

/** Statuses `rescheduleScheduledPost` accepts; anything else gets a fresh post instead. */
const RESCHEDULABLE: readonly ScheduledPostStatus[] = ['PENDING', 'QUEUED', 'FAILED'];

/** `NO_CAPACITY` carries the engine's per-slot warnings; surface them next to the message. */
function warningsFrom(err: unknown): string {
  if (!(err instanceof ApiClientError)) return '';
  const details = err.details;
  if (!details || typeof details !== 'object' || !('warnings' in details)) return '';
  const warnings = details.warnings;
  return Array.isArray(warnings) ? warnings.filter((w) => typeof w === 'string').join('; ') : '';
}

/**
 * Set/replace the publish date+time of one video. Rescheduling an existing post keeps its id (and
 * publishing log); a new one goes through `/api/schedules/generate` in CUSTOM mode so capacity,
 * arming and batch bookkeeping stay on the same path as the calendar.
 */
export function SchedulePostDialog({
  video,
  open,
  onOpenChange,
}: {
  video: VideoDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [dateTime, setDateTime] = useState('');
  const [accountId, setAccountId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: me } = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiFetch<{ user: SessionUserDto }>('/api/auth/me'),
    enabled: open,
  });

  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => apiFetch<{ items: AccountDto[] }>('/api/tiktok/accounts'),
    enabled: open,
  });

  const timezone = me?.user.timezone ?? 'UTC';
  const accounts = (accountsData?.items ?? []).filter((a) => a.connectionStatus === 'CONNECTED');

  useEffect(() => {
    if (!video || !open) return;
    const existing = video.scheduledPost;
    if (existing) {
      const tz = existing.timezone || timezone;
      setDateTime(
        `${formatLocalDate(existing.scheduledAt, tz)}T${formatLocalTime(existing.scheduledAt, tz)}`,
      );
    } else {
      const inAnHour = new Date(Date.now() + 3_600_000);
      setDateTime(
        `${formatLocalDate(inAnHour, timezone)}T${formatLocalTime(inAnHour, timezone)}`,
      );
    }
    setError(null);
  }, [video?.id, open]);

  useEffect(() => {
    if (!open || accountId) return;
    const preferred =
      video?.scheduledPost?.accountId ??
      (accounts.some((a) => a.id === me?.user.defaultAccountId) ? me!.user.defaultAccountId! : accounts[0]?.id);
    if (preferred) setAccountId(preferred);
  }, [open, accountId, accounts, me, video]);

  if (!video) return null;

  const existing = video.scheduledPost;
  const isReschedule = !!existing && RESCHEDULABLE.includes(existing.status);

  async function handleSave() {
    if (!video || !accountId) return;
    const [date, time] = dateTime.split('T');
    if (!date || !time) {
      setError('Pick a publish date and time');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const scheduledAt = localDateTimeToUtc(date, time, timezone).toISOString();
      if (isReschedule && existing) {
        await apiFetch(`/api/schedules/${existing.id}`, {
          method: 'PATCH',
          json: { scheduledAt, accountId },
        });
      } else {
        await apiFetch('/api/schedules/generate', {
          method: 'POST',
          json: {
            videoIds: [video.id],
            accountId,
            schedulingMode: 'CUSTOM',
            startDate: date,
            activeDays: [0, 1, 2, 3, 4, 5, 6],
            activeHoursStart: '00:00',
            activeHoursEnd: '23:59',
            timezone,
            customSlots: [{ date, time }],
          },
        });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.videos() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.schedules() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.queue }),
      ]);
      toast.success(isReschedule ? 'Post rescheduled' : 'Post scheduled');
      onOpenChange(false);
    } catch (err) {
      const warnings = warningsFrom(err);
      setError(
        err instanceof ApiClientError
          ? `${err.message}${warnings ? ` — ${warnings}` : ''}`
          : 'Failed to schedule',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{isReschedule ? 'Reschedule post' : 'Schedule post'}</DialogTitle>
        <DialogDescription>{video.title}</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="space-y-4">
          {existing && !isReschedule && (
            <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
              Already {existing.status.toLowerCase()}. Saving creates a new scheduled post.
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="schedule-account">Account</Label>
            <Select
              id="schedule-account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              disabled={accountsLoading || accounts.length === 0}
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  @{acc.username}
                </option>
              ))}
            </Select>
            {!accountsLoading && accounts.length === 0 && (
              <p className="text-xs text-error">No connected TikTok account. Connect one first.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="schedule-datetime">Publish date and time ({timezone})</Label>
            <Input
              id="schedule-datetime"
              type="datetime-local"
              value={dateTime}
              onChange={(e) => setDateTime(e.target.value)}
            />
          </div>
          {error && <p className="text-xs text-error">{error}</p>}
          <Button
            onClick={handleSave}
            disabled={saving || !accountId || accounts.length === 0}
            className="w-full"
          >
            <Calendar className="size-4" />
            {saving ? 'Saving...' : isReschedule ? 'Reschedule' : 'Schedule'}
          </Button>
        </div>
      </DialogBody>
    </Dialog>
  );
}
