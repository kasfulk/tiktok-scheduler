'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clapperboard,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ActivityPoint, DashboardStats, UpcomingPost } from '@tiktok-scheduler/shared';
import { apiFetch, queryKeys } from '@/lib/api-client';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/progress';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function StatCard({
  label,
  value,
  hint,
  icon,
  loading,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon: React.ReactNode;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between p-4">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
          {loading ? <Skeleton className="h-7 w-14" /> : <p className="tabular text-2xl font-semibold leading-none">{value}</p>}
          {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
        </div>
        <span className="rounded-md bg-muted p-1.5 text-muted-foreground [&_svg]:size-4">{icon}</span>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const stats = useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => apiFetch<DashboardStats>('/api/dashboard/stats'),
  });
  const upcoming = useQuery({
    queryKey: queryKeys.upcoming(6),
    queryFn: () => apiFetch<{ items: UpcomingPost[] }>('/api/dashboard/upcoming?limit=6'),
    refetchInterval: 60_000,
  });
  const activity = useQuery({
    queryKey: queryKeys.activity(30),
    queryFn: () => apiFetch<{ points: ActivityPoint[]; timezone: string }>('/api/dashboard/activity?days=30'),
  });

  const data = stats.data;
  const loading = stats.isPending;
  const publishedToday = data?.todayPublished ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Overview</h2>
          <p className="text-xs text-muted-foreground">
            Publishing status for {data?.timezone ?? 'your timezone'} ·{' '}
            {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/calendar" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <CalendarClock className="size-3.5" /> Open calendar
          </Link>
          <Link href="/upload" className={buttonVariants({ size: 'sm' })}>
            <Upload className="size-3.5" /> Upload videos
          </Link>
        </div>
      </div>

      {stats.isError ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-4 text-xs text-error">
            <AlertTriangle className="size-4" /> {stats.error.message}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total videos" value={data?.totalVideos ?? 0} hint={`${data?.draft ?? 0} not scheduled`} icon={<Clapperboard />} loading={loading} />
        <StatCard label="Scheduled" value={data?.scheduled ?? 0} hint={`${data?.inQueue ?? 0} waiting in queue`} icon={<CalendarClock />} loading={loading} />
        <StatCard label="Published" value={data?.published ?? 0} hint={`${publishedToday} today`} icon={<CheckCircle2 />} loading={loading} />
        <StatCard label="Failed" value={data?.failed ?? 0} hint="needs attention" icon={<AlertTriangle />} loading={loading} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>Published today</CardTitle>
              <CardDescription>Posts that went live today in {data?.timezone ?? 'your timezone'}.</CardDescription>
            </div>
            <Link href="/settings?tab=posting" className="text-[11px] text-muted-foreground underline-offset-4 hover:underline">
              Configure
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="tabular text-3xl font-semibold">{publishedToday}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {data?.scheduled ?? 0} post{(data?.scheduled ?? 0) === 1 ? '' : 's'} scheduled ahead
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Queue health</CardTitle>
            <CardDescription>Worker keeps publishing while the browser is closed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Waiting</span>
              <span className="tabular">{data?.inQueue ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Scheduled ahead</span>
              <span className="tabular">{data?.scheduled ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Failed attempts</span>
              <span className={data && data.failed > 0 ? 'tabular text-warning' : 'tabular'}>{data?.failed ?? 0}</span>
            </div>
            <Link href="/queue" className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
              <Activity className="size-3" /> Inspect the queue
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Upcoming posts</CardTitle>
            <CardDescription>Next six posts armed in the queue.</CardDescription>
          </div>
          <Link href="/calendar" className="text-[11px] text-muted-foreground underline-offset-4 hover:underline">
            View calendar
          </Link>
        </CardHeader>
        <CardContent className="p-0 pb-1">
          {upcoming.isPending ? (
            <div className="space-y-2 px-5 pb-4">
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} className="h-10 w-full" />
              ))}
            </div>
          ) : upcoming.data && upcoming.data.items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Video</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead className="pr-5 text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcoming.data.items.map((post) => (
                  <TableRow key={post.id}>
                    <TableCell className="pl-5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-14 shrink-0 overflow-hidden rounded bg-muted">
                          {post.thumbnailUrl ? (
                                                        <img src={post.thumbnailUrl} alt="" className="size-full object-cover" />
                          ) : null}
                        </div>
                        <span className="line-clamp-1 text-[13px] font-medium">{post.videoTitle}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">@{post.accountUsername}</TableCell>
                    <TableCell className="tabular text-xs">
                      {new Date(post.scheduledAt).toLocaleString(undefined, {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      <StatusBadge status={post.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={<CalendarClock />}
              title="Nothing scheduled yet"
              description="Upload videos, then generate a schedule from the calendar. The worker publishes them even when you are logged out."
              action={
                <Link href="/calendar" className={buttonVariants({ size: 'sm' })}>
                  Generate a schedule
                </Link>
              }
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activity · last 30 days</CardTitle>
          <CardDescription>Published vs failed attempts, bucketed by your local date.</CardDescription>
        </CardHeader>
        <CardContent>
          {activity.isPending ? (
            <Skeleton className="h-52 w-full" />
          ) : activity.data && activity.data.points.some((point) => point.published + point.failed > 0) ? (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activity.data.points} margin={{ top: 4, right: 8, bottom: 0, left: -18 }} barGap={2}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value: string) => value.slice(5)}
                    tickLine={false}
                    axisLine={false}
                    fontSize={10}
                    stroke="var(--muted-foreground)"
                    interval="preserveStartEnd"
                  />
                  <YAxis tickLine={false} axisLine={false} fontSize={10} stroke="var(--muted-foreground)" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      fontSize: 11,
                      color: 'var(--foreground)',
                    }}
                    labelStyle={{ color: 'var(--muted-foreground)' }}
                  />
                  <Bar dataKey="published" name="Published" fill="var(--c1)" radius={[3, 3, 0, 0]} maxBarSize={18} />
                  <Bar dataKey="failed" name="Failed" fill="var(--c4)" radius={[3, 3, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon={<Activity />}
              title="No publishing activity yet"
              description="Once posts are published or fail, this chart shows the last 30 days of results."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}