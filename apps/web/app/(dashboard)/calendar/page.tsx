'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Plus, AlertCircle, Video } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useMemo, useState, useEffect, Suspense } from 'react';
import { toast } from 'sonner';
import { apiFetch, queryKeys, ApiClientError } from '@/lib/api-client';
import type { ScheduledPostDto, AccountDto, VideoDto, PostingSettingsDto, SessionUserDto, GenerateScheduleResult } from '@/lib/types';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/progress';
import { Tabs } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatLocalDate, formatLocalTime, localDateTimeToUtc, WEEKDAY_LABELS } from '@tiktok-scheduler/shared';

type ViewMode = 'month' | 'week' | 'day' | 'list';

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

function CalendarPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const videoIdParam = searchParams.get('videoId');

  const [view, setView] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedPost, setSelectedPost] = useState<ScheduledPostDto | null>(null);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [, setDraggedPost] = useState<ScheduledPostDto | null>(null);

  const { data: meData } = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiFetch<{ user: SessionUserDto }>('/api/auth/me'),
  });

  const { data: accountsData } = useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => apiFetch<{ items: AccountDto[] }>('/api/tiktok/accounts'),
  });

  const { data: postingSettingsData } = useQuery({
    queryKey: queryKeys.postingSettings,
    queryFn: () => apiFetch<PostingSettingsDto>('/api/settings/posting'),
  });

  const { data: videoData } = useQuery({
    queryKey: queryKeys.video(videoIdParam ?? ''),
    queryFn: () => apiFetch<VideoDto>(`/api/videos/${videoIdParam}`),
    enabled: !!videoIdParam,
  });

  const dateRange = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    if (view === 'month') {
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const startDay = firstDay.getDay();
      const startDate = new Date(firstDay);
      startDate.setDate(startDate.getDate() - ((startDay + 6) % 7) - 7);
      const endDate = new Date(lastDay);
      endDate.setDate(endDate.getDate() + (7 - lastDay.getDay()) % 7 + 7);
      return { from: startDate.toISOString(), to: endDate.toISOString() };
    }

    if (view === 'week') {
      const startDay = currentDate.getDay();
      const startDate = new Date(currentDate);
      startDate.setDate(startDate.getDate() - ((startDay + 6) % 7) - 7);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 21);
      return { from: startDate.toISOString(), to: endDate.toISOString() };
    }

    if (view === 'day') {
      const startDate = new Date(currentDate);
      startDate.setDate(startDate.getDate() - 7);
      const endDate = new Date(currentDate);
      endDate.setDate(endDate.getDate() + 7);
      return { from: startDate.toISOString(), to: endDate.toISOString() };
    }

    const startDate = new Date(currentDate);
    startDate.setDate(startDate.getDate() - 30);
    const endDate = new Date(currentDate);
    endDate.setDate(endDate.getDate() + 30);
    return { from: startDate.toISOString(), to: endDate.toISOString() };
  }, [currentDate, view]);

  const { data: schedulesData, isLoading: schedulesLoading, error: schedulesError } = useQuery({
    queryKey: ['schedules', 'calendar', dateRange.from, dateRange.to],
    queryFn: () =>
      apiFetch<PaginatedResponse<ScheduledPostDto>>(
        `/api/schedules?from=${encodeURIComponent(dateRange.from)}&to=${encodeURIComponent(dateRange.to)}&pageSize=200`,
      ),
  });

  const rescheduleMutation = useMutation({
    mutationFn: ({ id, scheduledAt }: { id: string; scheduledAt: string }) =>
      apiFetch(`/api/schedules/${id}`, { method: 'PATCH', json: { scheduledAt } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.queue });
      toast.success('Post rescheduled');
    },
    onError: (error: ApiClientError) => {
      toast.error(error.message);
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
  });

  const handleDrop = (date: Date, post: ScheduledPostDto) => {
    const originalTime = formatLocalTime(post.scheduledAt, post.timezone);
    const newDate = formatLocalDate(date, post.timezone);
    const newScheduledAt = localDateTimeToUtc(newDate, originalTime, post.timezone).toISOString();

    queryClient.setQueryData(['schedules', 'calendar', dateRange.from, dateRange.to], (old: PaginatedResponse<ScheduledPostDto> | undefined) => {
      if (!old) return old;
      return {
        ...old,
        items: old.items.map((item: ScheduledPostDto) =>
          item.id === post.id ? { ...item, scheduledAt: newScheduledAt, localDate: newDate } : item,
        ),
      };
    });

    rescheduleMutation.mutate({ id: post.id, scheduledAt: newScheduledAt });
  };

  const navigate = (direction: -1 | 0 | 1) => {
    if (direction === 0) {
      setCurrentDate(new Date());
      return;
    }
    const newDate = new Date(currentDate);
    if (view === 'month') {
      newDate.setMonth(newDate.getMonth() + direction);
    } else if (view === 'week') {
      newDate.setDate(newDate.getDate() + direction * 7);
    } else if (view === 'day') {
      newDate.setDate(newDate.getDate() + direction);
    } else {
      newDate.setDate(newDate.getDate() + direction * 30);
    }
    setCurrentDate(newDate);
  };

  const dateLabel = useMemo(() => {
    if (view === 'month') {
      return currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }
    if (view === 'week') {
      const start = new Date(currentDate);
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    }
    if (view === 'day') {
      return currentDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
    return currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [currentDate, view]);

  const posts = schedulesData?.items ?? [];

  return (
    <div className="space-y-4">
      {videoIdParam && videoData && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-chart-1/10 p-3">
          <div className="flex items-center gap-2 text-sm">
            <Video className="size-4 text-chart-1" />
            <span>Scheduling video: <strong>{videoData.title}</strong></span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => router.push('/calendar')}>
            Dismiss
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Publishing Calendar</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowGenerateDialog(true)}>
            <Plus />
            Generate schedule
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Tabs
          items={[
            { value: 'month', label: 'Month' },
            { value: 'week', label: 'Week' },
            { value: 'day', label: 'Day' },
            { value: 'list', label: 'List' },
          ]}
          value={view}
          onChange={(v) => setView(v as ViewMode)}
        />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(0)}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={() => navigate(1)}>
            <ChevronRight />
          </Button>
          <span className="ml-2 text-sm font-medium">{dateLabel}</span>
        </div>
      </div>

      {schedulesError && (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<AlertCircle />}
              title="Failed to load calendar"
              description={schedulesError instanceof ApiClientError ? schedulesError.message : 'An unexpected error occurred'}
              action={<Button onClick={() => queryClient.invalidateQueries({ queryKey: ['schedules'] })}>Retry</Button>}
            />
          </CardContent>
        </Card>
      )}

      {schedulesLoading && (
        <Card>
          <CardContent className="py-12">
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!schedulesLoading && !schedulesError && posts.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<CalendarIcon />}
              title="No posts scheduled"
              description="Schedule posts from the Content Library or use the Generate Schedule dialog to create a publishing plan."
              action={
                <div className="flex gap-2">
                  <Link href="/content" className={buttonVariants({ variant: 'outline' })}>
                    Go to library
                  </Link>
                  <Button onClick={() => setShowGenerateDialog(true)}>
                    <Plus />
                    Generate schedule
                  </Button>
                </div>
              }
            />
          </CardContent>
        </Card>
      )}

      {!schedulesLoading && !schedulesError && posts.length > 0 && (
        <Card>
          <CardContent className="p-0">
            {view === 'month' && (
              <MonthView
                posts={posts}
                currentDate={currentDate}
                onPostClick={setSelectedPost}
                onDrop={handleDrop}
                onDragStart={setDraggedPost}
              />
            )}
            {view === 'week' && (
              <WeekView
                posts={posts}
                currentDate={currentDate}
                onPostClick={setSelectedPost}
                onDrop={handleDrop}
                onDragStart={setDraggedPost}
              />
            )}
            {view === 'day' && (
              <DayView
                posts={posts}
                currentDate={currentDate}
                onPostClick={setSelectedPost}
                onDrop={handleDrop}
                onDragStart={setDraggedPost}
              />
            )}
            {view === 'list' && <ListView posts={posts} onPostClick={setSelectedPost} />}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Drag posts to reschedule. Changes re-arm the publish job (never creates duplicates — server handles it).
      </p>

      {selectedPost && (
        <PostDialog
          post={selectedPost}
          accounts={accountsData?.items ?? []}
          onClose={() => setSelectedPost(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['schedules'] });
            queryClient.invalidateQueries({ queryKey: queryKeys.queue });
          }}
        />
      )}

      {showGenerateDialog && (
        <GenerateScheduleDialog
          accounts={accountsData?.items ?? []}
          postingSettings={postingSettingsData}
          timezone={meData?.user.timezone ?? 'UTC'}
          onClose={() => setShowGenerateDialog(false)}
          onGenerated={() => {
            queryClient.invalidateQueries({ queryKey: ['schedules'] });
            queryClient.invalidateQueries({ queryKey: queryKeys.queue });
          }}
        />
      )}
    </div>
  );
}

export default function CalendarPage() {
  return (
    <Suspense fallback={<div className="space-y-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-96 w-full" /></div>}>
      <CalendarPageContent />
    </Suspense>
  );
}

function MonthView({
  posts,
  currentDate,
  onPostClick,
  onDrop,
  onDragStart,
}: {
  posts: ScheduledPostDto[];
  currentDate: Date;
  onPostClick: (post: ScheduledPostDto) => void;
  onDrop: (date: Date, post: ScheduledPostDto) => void;
  onDragStart: (post: ScheduledPostDto | null) => void;
}) {
  const [selectedDay, setSelectedDay] = useState<{ date: Date; posts: ScheduledPostDto[] } | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startDay = firstDay.getDay();
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - ((startDay + 6) % 7));

  const days: Date[] = [];
  const current = new Date(startDate);
  while (days.length < 42) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  const postsByDate = useMemo(() => {
    const map = new Map<string, ScheduledPostDto[]>();
    posts.forEach((post) => {
      const date = post.localDate;
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(post);
    });
    return map;
  }, [posts]);

  return (
    <>
      <div className="grid grid-cols-7 border-b border-border">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <div key={day} className="px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const dateStr = formatLocalDate(day, 'UTC');
          const dayPosts = postsByDate.get(dateStr) ?? [];
          const isCurrentMonth = day.getMonth() === month;
          const isToday = formatLocalDate(new Date(), 'UTC') === dateStr;

          return (
            <div
              key={i}
              className={cn(
                'min-h-[120px] border-b border-r border-border p-2',
                !isCurrentMonth && 'bg-muted/20',
                isToday && 'bg-chart-1/5',
              )}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const postJson = e.dataTransfer.getData('application/json');
                if (postJson) {
                  const post = JSON.parse(postJson) as ScheduledPostDto;
                  onDrop(day, post);
                }
              }}
            >
              <div className="mb-1 text-xs font-medium">{day.getDate()}</div>
              <div className="space-y-1">
                {dayPosts.slice(0, 3).map((post) => (
                  <PostChip
                    key={post.id}
                    post={post}
                    onClick={() => onPostClick(post)}
                    onDragStart={() => onDragStart(post)}
                    onDragEnd={() => onDragStart(null)}
                  />
                ))}
                {dayPosts.length > 3 && (
                  <button
                    className="w-full text-left text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={() => setSelectedDay({ date: day, posts: dayPosts })}
                  >
                    +{dayPosts.length - 3} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedDay && (
        <Dialog open onOpenChange={(open) => !open && setSelectedDay(null)}>
          <DialogHeader>
            <DialogTitle>{selectedDay.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</DialogTitle>
            <DialogDescription>{selectedDay.posts.length} posts scheduled</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-2">
              {selectedDay.posts.map((post) => (
                <button
                  key={post.id}
                  className="flex w-full items-center gap-2 rounded-md border border-border p-2 text-left hover:bg-muted"
                  onClick={() => {
                    setSelectedDay(null);
                    onPostClick(post);
                  }}
                >
                  {post.video.thumbnailUrl ? (
                    <img src={post.video.thumbnailUrl} alt="" className="size-10 rounded object-cover" />
                  ) : (
                    <div className="flex size-10 items-center justify-center rounded bg-muted">
                      <Video className="size-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium">{post.video.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatLocalTime(post.scheduledAt, post.timezone)} · {post.account.username}
                    </div>
                  </div>
                  <StatusBadge status={post.status} />
                </button>
              ))}
            </div>
          </DialogBody>
        </Dialog>
      )}
    </>
  );
}

function WeekView({
  posts,
  currentDate,
  onPostClick,
  onDrop,
  onDragStart,
}: {
  posts: ScheduledPostDto[];
  currentDate: Date;
  onPostClick: (post: ScheduledPostDto) => void;
  onDrop: (date: Date, post: ScheduledPostDto) => void;
  onDragStart: (post: ScheduledPostDto | null) => void;
}) {
  const startDay = currentDate.getDay();
  const startDate = new Date(currentDate);
  startDate.setDate(startDate.getDate() - ((startDay + 6) % 7));

  const days = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(startDate);
    day.setDate(day.getDate() + i);
    return day;
  });

  const postsByDate = useMemo(() => {
    const map = new Map<string, ScheduledPostDto[]>();
    posts.forEach((post) => {
      const date = post.localDate;
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(post);
    });
    return map;
  }, [posts]);

  return (
    <div className="grid grid-cols-7">
      {days.map((day, i) => {
        const dateStr = formatLocalDate(day, 'UTC');
        const dayPosts = postsByDate.get(dateStr) ?? [];
        const isToday = formatLocalDate(new Date(), 'UTC') === dateStr;

        return (
          <div
            key={i}
            className={cn('min-h-[400px] border-r border-border p-2', isToday && 'bg-chart-1/5')}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const postJson = e.dataTransfer.getData('application/json');
              if (postJson) {
                const post = JSON.parse(postJson) as ScheduledPostDto;
                onDrop(day, post);
              }
            }}
          >
            <div className="mb-2 text-xs font-medium">
              {day.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' })}
            </div>
            <div className="space-y-1">
              {dayPosts.map((post) => (
                <PostChip
                  key={post.id}
                  post={post}
                  onClick={() => onPostClick(post)}
                  onDragStart={() => onDragStart(post)}
                  onDragEnd={() => onDragStart(null)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayView({
  posts,
  currentDate,
  onPostClick,
  onDrop,
  onDragStart,
}: {
  posts: ScheduledPostDto[];
  currentDate: Date;
  onPostClick: (post: ScheduledPostDto) => void;
  onDrop: (date: Date, post: ScheduledPostDto) => void;
  onDragStart: (post: ScheduledPostDto | null) => void;
}) {
  const dateStr = formatLocalDate(currentDate, 'UTC');
  const dayPosts = posts.filter((p) => p.localDate === dateStr).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  return (
    <div
      className="min-h-[400px] p-4"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const postJson = e.dataTransfer.getData('application/json');
        if (postJson) {
          const post = JSON.parse(postJson) as ScheduledPostDto;
          onDrop(currentDate, post);
        }
      }}
    >
      <div className="mb-3 text-sm font-medium">
        {currentDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
      </div>
      <div className="space-y-2">
        {dayPosts.map((post) => (
          <PostChip
            key={post.id}
            post={post}
            onClick={() => onPostClick(post)}
            onDragStart={() => onDragStart(post)}
            onDragEnd={() => onDragStart(null)}
          />
        ))}
      </div>
    </div>
  );
}

function ListView({ posts, onPostClick }: { posts: ScheduledPostDto[]; onPostClick: (post: ScheduledPostDto) => void }) {
  const grouped = useMemo(() => {
    const map = new Map<string, ScheduledPostDto[]>();
    posts
      .slice()
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
      .forEach((post) => {
        const date = post.localDate;
        if (!map.has(date)) map.set(date, []);
        map.get(date)!.push(post);
      });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [posts]);

  return (
    <div className="divide-y divide-border">
      {grouped.map(([date, dayPosts]) => (
        <div key={date} className="p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {new Date(date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
          <div className="space-y-2">
            {dayPosts.map((post) => (
              <button
                key={post.id}
                className="flex w-full items-center gap-3 rounded-md border border-border p-3 text-left hover:bg-muted"
                onClick={() => onPostClick(post)}
              >
                {post.video.thumbnailUrl ? (
                  <img src={post.video.thumbnailUrl} alt="" className="size-12 rounded object-cover" />
                ) : (
                  <div className="flex size-12 items-center justify-center rounded bg-muted">
                    <Video className="size-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-medium">{post.video.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatLocalTime(post.scheduledAt, post.timezone)} · {post.account.username}
                  </div>
                </div>
                <StatusBadge status={post.status} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PostChip({
  post,
  onClick,
  onDragStart,
  onDragEnd,
}: {
  post: ScheduledPostDto;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const statusColor = {
    PENDING: 'bg-chart-1/20 text-chart-1',
    QUEUED: 'bg-chart-1/20 text-chart-1',
    PUBLISHING: 'bg-warning/20 text-warning',
    PUBLISHED: 'bg-success/20 text-success',
    FAILED: 'bg-error/20 text-error',
    CANCELLED: 'bg-muted text-muted-foreground',
    MANUAL_ACTION_REQUIRED: 'bg-warning/20 text-warning',
  }[post.status] ?? 'bg-muted text-muted-foreground';

  return (
    <button
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/json', JSON.stringify(post));
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-opacity hover:opacity-80', statusColor)}
    >
      <div className="size-1.5 rounded-full bg-current" />
      <span className="flex-1 truncate">{formatLocalTime(post.scheduledAt, post.timezone)}</span>
      <span className="truncate text-[10px] opacity-70">{post.account.username}</span>
    </button>
  );
}

function PostDialog({
  post,
  accounts,
  onClose,
  onSaved,
}: {
  post: ScheduledPostDto;
  accounts: AccountDto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<'details' | 'reschedule' | 'account' | 'caption'>('details');
  const [dateTime, setDateTime] = useState(() => {
    const date = new Date(post.scheduledAt);
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60_000);
    return local.toISOString().slice(0, 16);
  });
  const [accountId, setAccountId] = useState(post.accountId);
  const [caption, setCaption] = useState(post.video.caption ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLocked = post.status === 'PUBLISHED' || post.status === 'CANCELLED';

  const handleReschedule = async () => {
    setPending(true);
    setError(null);
    try {
      const scheduledAt = new Date(dateTime).toISOString();
      await apiFetch(`/api/schedules/${post.id}`, { method: 'PATCH', json: { scheduledAt } });
      toast.success('Post rescheduled');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to reschedule');
    } finally {
      setPending(false);
    }
  };

  const handleChangeAccount = async () => {
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/schedules/${post.id}`, { method: 'PATCH', json: { accountId } });
      toast.success('Account changed');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to change account');
    } finally {
      setPending(false);
    }
  };

  const handleSaveCaption = async () => {
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/videos/${post.videoId}`, { method: 'PATCH', json: { caption } });
      toast.success('Caption updated');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to update caption');
    } finally {
      setPending(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Cancel this scheduled post?')) return;
    setPending(true);
    try {
      await apiFetch(`/api/schedules/${post.id}`, { method: 'DELETE' });
      toast.success('Post cancelled');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to cancel');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogHeader>
        <DialogTitle>Post details</DialogTitle>
        <DialogDescription>{post.video.title}</DialogDescription>
      </DialogHeader>
      <DialogBody>
        {isLocked && (
          <div className="mb-3 rounded-md bg-muted p-2 text-xs text-muted-foreground">
            This post is {post.status.toLowerCase()} and cannot be modified.
          </div>
        )}

        <div className="mb-4 flex items-center gap-2">
          {post.video.thumbnailUrl ? (
            <img src={post.video.thumbnailUrl} alt="" className="size-16 rounded object-cover" />
          ) : (
            <div className="flex size-16 items-center justify-center rounded bg-muted">
              <Video className="size-6 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1">
            <div className="text-sm font-medium">{post.video.title}</div>
            <div className="text-xs text-muted-foreground">
              {post.account.username} · <StatusBadge status={post.status} />
            </div>
          </div>
        </div>

        <div className="mb-4 space-y-1 text-xs">
          <div>Scheduled: {new Date(post.scheduledAt).toLocaleString()}</div>
          <div>Retries: {post.retryCount}/{post.maxRetries}</div>
          {post.errorMessage && <div className="text-error">Error: {post.errorMessage}</div>}
          {post.externalPublishId && <div>External ID: {post.externalPublishId}</div>}
        </div>

        {!isLocked && (
          <Tabs
            items={[
              { value: 'reschedule', label: 'Reschedule' },
              { value: 'account', label: 'Account' },
              { value: 'caption', label: 'Caption' },
            ]}
            value={tab}
            onChange={(v) => setTab(v as 'details' | 'reschedule' | 'account' | 'caption')}
          />
        )}

        {!isLocked && tab === 'reschedule' && (
          <div className="mt-3 space-y-2">
            <Label>New date and time</Label>
            <Input type="datetime-local" value={dateTime} onChange={(e) => setDateTime(e.target.value)} />
            {error && <p className="text-xs text-error">{error}</p>}
            <Button onClick={handleReschedule} disabled={pending} className="w-full">
              {pending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        )}

        {!isLocked && tab === 'account' && (
          <div className="mt-3 space-y-2">
            <Label>Account</Label>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.username}
                </option>
              ))}
            </Select>
            {error && <p className="text-xs text-error">{error}</p>}
            <Button onClick={handleChangeAccount} disabled={pending} className="w-full">
              {pending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        )}

        {!isLocked && tab === 'caption' && (
          <div className="mt-3 space-y-2">
            <Label>Caption</Label>
            <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} />
            {error && <p className="text-xs text-error">{error}</p>}
            <Button onClick={handleSaveCaption} disabled={pending} className="w-full">
              {pending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        )}

        {!isLocked && (
          <Button variant="destructive" onClick={handleCancel} disabled={pending} className="mt-3 w-full">
            Cancel post
          </Button>
        )}
      </DialogBody>
    </Dialog>
  );
}

function GenerateScheduleDialog({
  accounts,
  postingSettings,
  timezone,
  onClose,
  onGenerated,
}: {
  accounts: AccountDto[];
  postingSettings?: PostingSettingsDto;
  timezone: string;
  onClose: () => void;
  onGenerated: () => void;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [mode, setMode] = useState<'INTERVAL' | 'FIXED_TIME' | 'SMART'>('INTERVAL');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('09:00');
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [postingTimes, setPostingTimes] = useState<string[]>(['09:00', '12:00', '18:00']);
  const [dailyLimit, setDailyLimit] = useState(postingSettings?.dailyPostingLimit ?? 5);
  const [activeDays, setActiveDays] = useState<number[]>(postingSettings?.activeDays ?? [1, 2, 3, 4, 5]);
  const [activeHoursStart, setActiveHoursStart] = useState(postingSettings?.activeHoursStart ?? '09:00');
  const [activeHoursEnd, setActiveHoursEnd] = useState(postingSettings?.activeHoursEnd ?? '22:00');
  const [publishMethod, setPublishMethod] = useState<'DIRECT_POST' | 'UPLOAD_DRAFT'>('DIRECT_POST');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: videosData } = useQuery({
    queryKey: queryKeys.videos({ status: 'READY' }),
    queryFn: () => apiFetch<PaginatedResponse<VideoDto>>('/api/videos?status=READY&pageSize=100'),
  });

  const videos = videosData?.items ?? [];
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);

  useEffect(() => {
    if (videos.length > 0 && selectedVideoIds.length === 0) {
      setSelectedVideoIds(videos.map((v) => v.id));
    }
  }, [videos, selectedVideoIds.length]);

  const toggleDay = (day: number) => {
    setActiveDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const handleSubmit = async () => {
    if (!accountId) {
      setError('Please select an account');
      return;
    }
    if (selectedVideoIds.length === 0) {
      setError('Please select at least one video');
      return;
    }

    setPending(true);
    setError(null);
    try {
      const result = await apiFetch<GenerateScheduleResult>('/api/schedules/generate', {
        method: 'POST',
        json: {
          videoIds: selectedVideoIds,
          accountId,
          schedulingMode: mode,
          startDate,
          startTime: mode === 'FIXED_TIME' ? startTime : undefined,
          intervalMinutes: mode === 'INTERVAL' ? intervalMinutes : undefined,
          postingTimes: mode === 'FIXED_TIME' ? postingTimes : undefined,
          dailyPostingLimit: dailyLimit,
          activeDays,
          activeHoursStart,
          activeHoursEnd,
          timezone,
          publishMethod,
        },
      });

      toast.success(`${result.posts.length} posts scheduled`);
      if (result.unscheduled > 0) {
        toast.warning(`${result.unscheduled} videos could not be scheduled`);
      }
      if (result.warnings.length > 0) {
        result.warnings.forEach((w) => toast.info(w));
      }

      onGenerated();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to generate schedule');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogHeader>
        <DialogTitle>Generate schedule</DialogTitle>
        <DialogDescription>Create a publishing plan for your ready videos</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="space-y-4">
          <div>
            <Label>Account</Label>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Select account</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.username}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label>Videos ({selectedVideoIds.length} selected)</Label>
            <div className="mt-1 max-h-32 overflow-y-auto rounded-md border border-border p-2">
              {videos.length === 0 ? (
                <p className="text-xs text-muted-foreground">No ready videos available</p>
              ) : (
                videos.map((video) => (
                  <label key={video.id} className="flex items-center gap-2 py-1 text-xs">
                    <input
                      type="checkbox"
                      checked={selectedVideoIds.includes(video.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedVideoIds((prev) => [...prev, video.id]);
                        } else {
                          setSelectedVideoIds((prev) => prev.filter((id) => id !== video.id));
                        }
                      }}
                    />
                    <span className="truncate">{video.title}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div>
            <Label>Scheduling mode</Label>
            <Select value={mode} onChange={(e) => setMode(e.target.value as 'INTERVAL' | 'FIXED_TIME' | 'SMART')}>
              <option value="INTERVAL">Interval</option>
              <option value="FIXED_TIME">Fixed time</option>
              <option value="SMART">Smart</option>
            </Select>
          </div>

          <div>
            <Label>Start date</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>

          {mode === 'INTERVAL' && (
            <div>
              <Label>Interval (minutes)</Label>
              <Input type="number" value={intervalMinutes} onChange={(e) => setIntervalMinutes(Number(e.target.value))} min={1} />
            </div>
          )}

          {mode === 'FIXED_TIME' && (
            <>
              <div>
                <Label>Start time</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <Label>Posting times</Label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {postingTimes.map((time, i) => (
                    <Badge key={i} variant="outline">
                      {time}
                      <button
                        className="ml-1 text-muted-foreground hover:text-foreground"
                        onClick={() => setPostingTimes(postingTimes.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          <div>
            <Label>Daily limit</Label>
            <Input type="number" value={dailyLimit} onChange={(e) => setDailyLimit(Number(e.target.value))} min={1} />
          </div>

          <div>
            <Label>Active days</Label>
            <div className="mt-1 flex gap-1">
              {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                <button
                  key={day}
                  className={cn(
                    'rounded-md px-2 py-1 text-xs',
                    activeDays.includes(day) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                  )}
                  onClick={() => toggleDay(day)}
                >
                  {WEEKDAY_LABELS[day]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Active hours start</Label>
              <Input type="time" value={activeHoursStart} onChange={(e) => setActiveHoursStart(e.target.value)} />
            </div>
            <div>
              <Label>Active hours end</Label>
              <Input type="time" value={activeHoursEnd} onChange={(e) => setActiveHoursEnd(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Publish method</Label>
            <Select value={publishMethod} onChange={(e) => setPublishMethod(e.target.value as 'DIRECT_POST' | 'UPLOAD_DRAFT')}>
              <option value="DIRECT_POST">Direct post</option>
              <option value="UPLOAD_DRAFT">Upload as draft</option>
            </Select>
          </div>

          {error && <p className="text-xs text-error">{error}</p>}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={pending}>
          {pending ? 'Generating...' : 'Generate'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
