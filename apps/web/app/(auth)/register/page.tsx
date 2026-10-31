'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { registerSchema, type RegisterInput } from '@tiktok-scheduler/shared';

import { apiFetch, ApiClientError, queryKeys } from '@/lib/api-client';
import type { SessionUserDto } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input, Select, Label, FieldError } from '@/components/ui/input';
import { useQueryClient } from '@tanstack/react-query';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? undefined;
  const queryClient = useQueryClient();

  const browserTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return 'UTC';
    }
  }, []);

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
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', timezone: browserTimezone },
  });

  const [formError, setFormError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { user } = await apiFetch<{ user: SessionUserDto }>('/api/auth/register', {
        method: 'POST',
        json: values,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      toast.success(`Welcome, ${user.name}`);
      router.push(next ?? '/dashboard');
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError) {
        setFormError(error.message);
        const details = error.details as Array<{ path: string; message: string }> | undefined;
        if (Array.isArray(details)) {
          for (const detail of details) {
            if (detail.path === 'name' || detail.path === 'email' || detail.path === 'password' || detail.path === 'timezone') {
              setError(detail.path as 'name' | 'email' | 'password' | 'timezone', { message: detail.message });
            }
          }
        }
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>Start scheduling TikTok posts in under a minute.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {formError ? (
            <div className="rounded-md border border-error/30 bg-error/5 px-3 py-2 text-xs text-error">
              {formError}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" type="text" autoComplete="name" disabled={isSubmitting} {...register('name')} />
            <FieldError>{errors.name?.message}</FieldError>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" disabled={isSubmitting} {...register('email')} />
            <FieldError>{errors.email?.message}</FieldError>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              disabled={isSubmitting}
              {...register('password')}
            />
            <FieldError>{errors.password?.message}</FieldError>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="timezone">Timezone</Label>
            <Select id="timezone" disabled={isSubmitting} {...register('timezone')}>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replaceAll('_', ' ')}
                </option>
              ))}
            </Select>
            <FieldError>{errors.timezone?.message}</FieldError>
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
