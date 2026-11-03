'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { WEEKDAY_LABELS } from '@tiktok-scheduler/shared';

import { apiFetch, ApiClientError, queryKeys } from '@/lib/api-client';
import type { AccountDto, AccountPostingSettingsDto } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Select, Label } from '@/components/ui/input';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/toggle';
import { Skeleton } from '@/components/ui/progress';
import { EmptyState } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export default function AccountsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => apiFetch<{ items: AccountDto[] }>('/api/tiktok/accounts'),
  });

  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [connectData, setConnectData] = useState<{ authorizeUrl: string; mode: 'mock' | 'live' } | null>(null);
  const [limitsAccount, setLimitsAccount] = useState<AccountDto | null>(null);
  const [disconnectAccount, setDisconnectAccount] = useState<AccountDto | null>(null);

  const connectMutation = useMutation({
    mutationFn: () => apiFetch<{ authorizeUrl: string; mode: 'mock' | 'live' }>('/api/tiktok/connect'),
    onSuccess: (data) => {
      setConnectData(data);
      setConnectDialogOpen(true);
    },
    onError: (error: ApiClientError) => toast.error(error.message),
  });

  const browserMutation = useMutation({
    mutationFn: () => apiFetch<AccountDto>('/api/tiktok/accounts/browser', { method: 'POST' }),
    onSuccess: (account) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
      toast.success(`Imported @${account.username} from the browser session`);
    },
    onError: (error: ApiClientError) => toast.error(error.message),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<AccountDto>(`/api/tiktok/accounts/${id}`, { method: 'PATCH', json: { isDefault: true } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
      toast.success('Default account updated');
    },
    onError: (error: ApiClientError) => toast.error(error.message),
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/tiktok/accounts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
      toast.success('Account disconnected');
      setDisconnectAccount(null);
    },
    onError: (error: ApiClientError) => toast.error(error.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">TikTok Accounts</h1>
          <p className="text-xs text-muted-foreground">Connect and manage your TikTok accounts.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">TikTok Accounts</h1>
          <p className="text-xs text-muted-foreground">Connect and manage your TikTok accounts.</p>
        </div>
        <Card>
          <CardContent className="py-8 text-center text-xs text-error">Failed to load accounts.</CardContent>
        </Card>
      </div>
    );
  }

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">TikTok Accounts</h1>
          <p className="text-xs text-muted-foreground">Connect and manage your TikTok accounts.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => browserMutation.mutate()}
            disabled={browserMutation.isPending}
            title="Reads the TikTok login from the Chromium profile on this host (CDP on 127.0.0.1:9333)"
          >
            {browserMutation.isPending ? 'Reading browser…' : 'Connect via browser'}
          </Button>
          <Button onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending}>
            {connectMutation.isPending ? 'Connecting…' : 'Connect account'}
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            title="No accounts connected"
            description="Connect a TikTok account to start scheduling and publishing posts. After connecting, you can set posting limits and choose a default account."
            action={
              <Button onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending}>
                Connect account
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onSetDefault={() => setDefaultMutation.mutate(account.id)}
              onDisconnect={() => setDisconnectAccount(account)}
              onEditLimits={() => setLimitsAccount(account)}
            />
          ))}
        </div>
      )}

      <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <DialogHeader>
          <DialogTitle>{connectData?.mode === 'mock' ? 'Mock mode' : 'Connect to TikTok'}</DialogTitle>
          <DialogDescription>
            {connectData?.mode === 'mock'
              ? 'You are in mock mode. Publishing will exercise the full worker path but will not touch TikTok. To use live mode, set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET environment variables.'
              : 'You will be redirected to TikTok to authorize access.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConnectDialogOpen(false)}>
            Cancel
          </Button>
          {connectData ? (
            <Button
              onClick={() => {
                window.location.href = connectData.authorizeUrl;
              }}
            >
              {connectData.mode === 'mock' ? 'Continue' : 'Authorize'}
            </Button>
          ) : null}
        </DialogFooter>
      </Dialog>

      <ConfirmDialog
        open={!!disconnectAccount}
        onOpenChange={(open) => !open && setDisconnectAccount(null)}
        title="Disconnect account"
        description={`Are you sure you want to disconnect @${disconnectAccount?.username}? Scheduled posts for this account will be cancelled.`}
        confirmLabel="Disconnect"
        onConfirm={() => disconnectAccount && disconnectMutation.mutate(disconnectAccount.id)}
        pending={disconnectMutation.isPending}
      />

      {limitsAccount ? <AccountLimitsDialog account={limitsAccount} onClose={() => setLimitsAccount(null)} /> : null}
    </div>
  );
}

function AccountCard({
  account,
  onSetDefault,
  onDisconnect,
  onEditLimits,
}: {
  account: AccountDto;
  onSetDefault: () => void;
  onDisconnect: () => void;
  onEditLimits: () => void;
}) {
  const expiresAt = account.tokenExpiresAt ? new Date(account.tokenExpiresAt) : null;
  const now = new Date();
  const hoursUntilExpiry = expiresAt ? (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60) : null;
  const isExpired = hoursUntilExpiry !== null && hoursUntilExpiry <= 0;
  const isWarning = hoursUntilExpiry !== null && hoursUntilExpiry > 0 && hoursUntilExpiry < 6;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-muted text-sm font-medium">
            {account.avatarUrl ? (
              <img src={account.avatarUrl} alt="" className="size-10 rounded-full object-cover" />
            ) : (
              account.username.slice(0, 2).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium">@{account.username}</p>
            <p className="truncate text-xs text-muted-foreground">{account.displayName ?? '—'}</p>
          </div>
          <StatusBadge status={account.connectionStatus} />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {account.isDefault ? <Badge variant="info">default</Badge> : null}
          {account.authMode === 'BROWSER' ? <Badge variant="warning">browser session</Badge> : null}
          {account.scopes.map((scope) => (
            <Badge key={scope} variant="outline">
              {scope}
            </Badge>
          ))}
        </div>

        {expiresAt ? (
          <div className="text-xs">
            <span className="text-muted-foreground">Token expires: </span>
            <span className={cn('tabular', isExpired && 'text-error', isWarning && !isExpired && 'text-warning')}>
              {isExpired
                ? 'Expired'
                : hoursUntilExpiry !== null && hoursUntilExpiry < 24
                  ? `in ${Math.floor(hoursUntilExpiry)}h`
                  : expiresAt.toLocaleDateString()}
            </span>
            <span className="text-muted-foreground"> · {expiresAt.toLocaleString()}</span>
          </div>
        ) : null}

        <div className="flex gap-2 border-t border-border pt-3">
          {!account.isDefault ? (
            <Button variant="outline" size="sm" onClick={onSetDefault}>
              Set default
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={onEditLimits}>
            Limits
          </Button>
          <Button variant="ghost" size="sm" onClick={onDisconnect} className="text-error hover:text-error">
            Disconnect
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AccountLimitsDialog({ account, onClose }: { account: AccountDto; onClose: () => void }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.accountSettings(account.id),
    queryFn: () => apiFetch<AccountPostingSettingsDto>(`/api/settings/accounts/${account.id}/posting`),
  });

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { isDirty, isSubmitting },
  } = useForm<AccountPostingSettingsDto>({
    values: data,
    disabled: isLoading,
  });

  const values = watch();

  const mutation = useMutation({
    mutationFn: (v: AccountPostingSettingsDto) => {
      const { accountId: _a, ...payload } = v;
      void _a;
      return apiFetch<AccountPostingSettingsDto>(`/api/settings/accounts/${account.id}/posting`, {
        method: 'PATCH',
        json: payload,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accountSettings(account.id) });
      toast.success('Account limits saved');
      onClose();
    },
    onError: (error: ApiClientError) => toast.error(error.message),
  });

  const timezones = (() => {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      return ['UTC'];
    }
  })();

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogHeader>
        <DialogTitle>Posting limits for @{account.username}</DialogTitle>
        <DialogDescription>Override the global posting schedule for this account.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate>
        <DialogBody>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <Label htmlFor="account-enabled" className="text-sm font-medium text-foreground">
                  Enable custom limits
                </Label>
                <Controller
                  name="enabled"
                  control={control}
                  render={({ field }) => (
                    <Switch
                      id="account-enabled"
                      label="Enable custom limits"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="account-daily-limit">Daily limit</Label>
                  <Input
                    id="account-daily-limit"
                    type="number"
                    min={1}
                    max={100}
                    {...register('dailyPostingLimit', { valueAsNumber: true })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="account-interval">Minimum interval (min)</Label>
                  <Input
                    id="account-interval"
                    type="number"
                    min={1}
                    {...register('minimumIntervalMinutes', { valueAsNumber: true })}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="account-start">Active hours start</Label>
                  <Input id="account-start" type="time" {...register('activeHoursStart')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="account-end">Active hours end</Label>
                  <Input id="account-end" type="time" {...register('activeHoursEnd')} />
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
                <Label htmlFor="account-timezone">Timezone</Label>
                <Select id="account-timezone" {...register('timezone')}>
                  {timezones.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz.replaceAll('_', ' ')}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!isDirty || isSubmitting || mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
