'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { WEEKDAY_LABELS } from '@tiktok-scheduler/shared';

import { apiFetch, ApiClientError, queryKeys } from '@/lib/api-client';
import type {
  GeneralSettingsDto,
  PostingSettingsDto,
  AccountDto,
  HealthResponse,
} from '@/lib/types';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input, Select, Label, FieldError } from '@/components/ui/input';
import { Switch } from '@/components/ui/toggle';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const TABS = [
  { value: 'general', label: 'General' },
  { value: 'posting', label: 'Posting Schedule' },
  { value: 'accounts', label: 'Accounts' },
  { value: 'api', label: 'API & Worker' },
] as const;

export default function SettingsPage() {
  const [tab, setTab] = useState('general');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
        <p className="text-xs text-muted-foreground">Manage your account, posting rules and integrations.</p>
      </div>

      <Tabs items={TABS} value={tab} onChange={setTab} />

      {tab === 'general' ? <GeneralTab /> : null}
      {tab === 'posting' ? <PostingTab /> : null}
      {tab === 'accounts' ? <AccountsTab /> : null}
      {tab === 'api' ? <ApiTab /> : null}
    </div>
  );
}

/* ─── General ─────────────────────────────────────────────────────────────── */

function GeneralTab() {
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.generalSettings,
    queryFn: () => apiFetch<GeneralSettingsDto>('/api/settings/general'),
  });

  const { data: accountsData } = useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => apiFetch<{ items: AccountDto[] }>('/api/tiktok/accounts'),
  });

  const timezones = useMemo(() => {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      return ['UTC'];
    }
  }, []);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<GeneralSettingsDto>({
    values: data,
    disabled: isLoading || isError,
  });

  const telegramEnabled = watch('telegramEnabled');

  const mutation = useMutation({
    mutationFn: (values: Partial<GeneralSettingsDto>) =>
      apiFetch<GeneralSettingsDto>('/api/settings/general', { method: 'PATCH', json: values }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.generalSettings });
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
      toast.success('Settings saved');
    },
    onError: (error: ApiClientError) => {
      toast.error(error.message);
      const details = error.details as Array<{ path: string; message: string }> | undefined;
      if (Array.isArray(details)) {
        for (const d of details) {
          const key = d.path as keyof GeneralSettingsDto;
          if (key in (data ?? {})) {
            setError(key, { message: d.message });
          }
        }
      }
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiFetch('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.clear();
      router.push('/login');
      router.refresh();
    },
    onError: (error: ApiClientError) => toast.error(error.message),
  });

  if (isLoading) return <GeneralSkeleton />;
  if (isError || !data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-xs text-error">
          Failed to load settings.
        </CardContent>
      </Card>
    );
  }

  const accounts = accountsData?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>General</CardTitle>
        <CardDescription>Profile, timezone and notification preferences.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit((values) => {
            const { email: _email, ...payload } = values;
            void _email;
            mutation.mutate(payload);
          })}
          className="space-y-4"
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" {...register('name')} />
              <FieldError>{errors.name?.message}</FieldError>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" disabled value={data.email} readOnly />
              <p className="text-[11px] text-muted-foreground">Email cannot be changed here.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="timezone">Timezone</Label>
            <Select id="timezone" {...register('timezone')}>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replaceAll('_', ' ')}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="defaultAccountId">Default account</Label>
            <Select id="defaultAccountId" {...register('defaultAccountId')}>
              <option value="">None</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  @{a.username}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="telegramEnabled" className="text-sm font-medium text-foreground">
                Telegram notifications
              </Label>
              <p className="text-[11px] text-muted-foreground">Get notified when posts publish or fail.</p>
            </div>
            <Controller
              name="telegramEnabled"
              control={control}
              render={({ field }) => (
                <Switch
                  id="telegramEnabled"
                  label="Telegram notifications"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </div>

          <div className={cn('space-y-1.5', !telegramEnabled && 'opacity-50')}>
            <Label htmlFor="telegramChatId">Telegram chat ID</Label>
            <Input
              id="telegramChatId"
              disabled={!telegramEnabled}
              placeholder="e.g. -1001234567890"
              {...register('telegramChatId')}
            />
            <FieldError>{errors.telegramChatId?.message}</FieldError>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-4">
            <Button type="submit" disabled={!isDirty || isSubmitting || mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save changes'}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={logoutMutation.isPending}
              onClick={() => logoutMutation.mutate()}
            >
              {logoutMutation.isPending ? 'Signing out…' : 'Sign out'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function GeneralSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-48" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </CardContent>
    </Card>
  );
}

/* ─── Posting Schedule ────────────────────────────────────────────────────── */

function PostingTab() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.postingSettings,
    queryFn: () => apiFetch<PostingSettingsDto>('/api/settings/posting'),
  });

  const timezones = useMemo(() => {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      return ['UTC'];
    }
  }, []);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { isDirty, isSubmitting, errors },
  } = useForm<PostingSettingsDto>({
    values: data,
    disabled: isLoading || isError,
  });

  const values = watch();

  const mutation = useMutation({
    mutationFn: (v: PostingSettingsDto) => {
      const { updatedAt: _u, ...payload } = v;
      void _u;
      return apiFetch<PostingSettingsDto>('/api/settings/posting', { method: 'PATCH', json: payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.postingSettings });
      toast.success('Posting schedule saved. Pending scheduled posts will be re-planned by the worker.');
    },
    onError: (error: ApiClientError) => toast.error(error.message),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-4 py-8">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-xs text-error">
          Failed to load posting settings.
        </CardContent>
      </Card>
    );
  }

  const summary = buildSummary(values);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Posting Schedule</CardTitle>
        <CardDescription>Control how the worker plans new posts.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4" noValidate>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="enableDailyLimit" className="text-sm font-medium text-foreground">
                Enable daily limit
              </Label>
              <p className="text-[11px] text-muted-foreground">Cap the number of posts per day.</p>
            </div>
            <Controller
              name="enableDailyLimit"
              control={control}
              render={({ field }) => (
                <Switch
                  id="enableDailyLimit"
                  label="Enable daily limit"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dailyPostingLimit">Daily limit</Label>
              <Input
                id="dailyPostingLimit"
                type="number"
                min={1}
                max={100}
                {...register('dailyPostingLimit', { valueAsNumber: true })}
              />
              <FieldError>{errors.dailyPostingLimit?.message}</FieldError>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="minimumIntervalMinutes">Minimum interval (min)</Label>
              <Input
                id="minimumIntervalMinutes"
                type="number"
                min={1}
                {...register('minimumIntervalMinutes', { valueAsNumber: true })}
              />
              <FieldError>{errors.minimumIntervalMinutes?.message}</FieldError>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="activeHoursStart">Active hours start</Label>
              <Input id="activeHoursStart" type="time" {...register('activeHoursStart')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="activeHoursEnd">Active hours end</Label>
              <Input id="activeHoursEnd" type="time" {...register('activeHoursEnd')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Active days</Label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_LABELS.map((label, index) => {
                const active = values.activeDays.includes(index);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      const next = active
                        ? values.activeDays.filter((d) => d !== index)
                        : [...values.activeDays, index];
                      setValue('activeDays', next, { shouldDirty: true });
                    }}
                    className={cn(
                      'h-8 rounded-md border px-3 text-xs font-medium transition-colors',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="posting-timezone">Timezone</Label>
            <Select id="posting-timezone" {...register('timezone')}>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replaceAll('_', ' ')}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Limit scope</Label>
            <div className="flex gap-3">
              {(['GLOBAL', 'PER_ACCOUNT'] as const).map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    {...register('limitScope')}
                    value={scope}
                    className="accent-[var(--primary)]"
                  />
                  {scope === 'GLOBAL' ? 'Global' : 'Per account'}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="defaultSchedulingMode">Default scheduling mode</Label>
            <Select id="defaultSchedulingMode" {...register('defaultSchedulingMode')}>
              {(['INTERVAL', 'FIXED_TIME', 'CUSTOM', 'SMART'] as const).map((mode) => (
                <option key={mode} value={mode}>
                  {mode.replaceAll('_', ' ')}
                </option>
              ))}
            </Select>
          </div>

          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {summary}
          </div>

          <div className="flex justify-end border-t border-border pt-4">
            <Button type="submit" disabled={!isDirty || isSubmitting || mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function buildSummary(values: PostingSettingsDto): string {
  const limit = values.enableDailyLimit ? `Up to ${values.dailyPostingLimit} posts/day` : 'No daily limit';
  const interval = `at least ${values.minimumIntervalMinutes} min apart`;
  const hours = `${values.activeHoursStart}–${values.activeHoursEnd}`;
  const tz = values.timezone.replaceAll('_', ' ');
  return `${limit}, ${interval}, ${hours} in ${tz}.`;
}

/* ─── Accounts tab ────────────────────────────────────────────────────────── */

function AccountsTab() {
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => apiFetch<{ items: AccountDto[] }>('/api/tiktok/accounts'),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-3 py-8">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-xs text-error">
          Failed to load accounts.
        </CardContent>
      </Card>
    );
  }

  const items = data?.items ?? [];

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm font-medium">No accounts connected</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Connect a TikTok account to start scheduling posts.
          </p>
          <Link href="/accounts" className={buttonVariants({ className: 'mt-4' })}>
            Connect account
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected accounts</CardTitle>
        <CardDescription>
          {items.length} account{items.length === 1 ? '' : 's'} connected.{' '}
          <Link href="/accounts" className="font-medium text-foreground underline-offset-4 hover:underline">
            Manage
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {items.map((account) => (
            <div key={account.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
              <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                {account.avatarUrl ? (
                  <img src={account.avatarUrl} alt="" className="size-8 rounded-full object-cover" />
                ) : (
                  account.username.slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">@{account.username}</p>
                <p className="truncate text-xs text-muted-foreground">{account.displayName ?? '—'}</p>
              </div>
              <StatusBadge status={account.connectionStatus} />
              {account.isDefault ? <Badge variant="info">default</Badge> : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── API & Worker ────────────────────────────────────────────────────────── */

function ApiTab() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch<HealthResponse>('/api/health'),
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-3 py-8">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-xs text-error">
          Failed to load system status.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>API & Worker</CardTitle>
            <CardDescription>System health and worker status.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="flex items-center gap-3">
              <StatusDot ok={data.database} />
              <div>
                <p className="text-sm font-medium">Database</p>
                <p className="text-xs text-muted-foreground">{data.database ? 'Connected' : 'Unavailable'}</p>
              </div>
            </div>
            <StatusBadge status={data.database ? 'CONNECTED' : 'DISCONNECTED'} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="flex items-center gap-3">
              <StatusDot ok={data.redis} />
              <div>
                <p className="text-sm font-medium">Redis</p>
                <p className="text-xs text-muted-foreground">{data.redis ? 'Connected' : 'Unavailable'}</p>
              </div>
            </div>
            <StatusBadge status={data.redis ? 'CONNECTED' : 'DISCONNECTED'} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Queue</p>
              <p className="text-xs text-muted-foreground">
                {data.queuePaused ? 'Worker is paused' : 'Worker is active'}
              </p>
            </div>
            <Badge variant={data.queuePaused ? 'warning' : 'success'}>
              {data.queuePaused ? 'Paused' : 'Running'}
            </Badge>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">TikTok mode</p>
              <p className="text-xs text-muted-foreground">
                {data.tiktokMode === 'live'
                  ? 'Live mode — requires an approved TikTok app.'
                  : 'Mock mode — publishing exercises the full worker path but does not touch TikTok.'}
              </p>
            </div>
            <Badge variant={data.tiktokMode === 'live' ? 'default' : 'muted'}>
              {data.tiktokMode === 'live' ? 'Live' : 'Mock'}
            </Badge>
          </div>

          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Overall status: <span className="font-medium text-foreground">{data.status}</span>
            <span className="mx-2">·</span>
            Last checked: {new Date(data.time).toLocaleString()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn('inline-block size-2 rounded-full', ok ? 'bg-success' : 'bg-error')}
      aria-label={ok ? 'Healthy' : 'Unhealthy'}
    />
  );
}
