'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { loginSchema, type LoginInput } from '@tiktok-scheduler/shared';

import { apiFetch, ApiClientError, queryKeys } from '@/lib/api-client';
import type { SessionUserDto } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input, Label, FieldError } from '@/components/ui/input';
import { useQueryClient } from '@tanstack/react-query';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? undefined;
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const [formError, setFormError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { user } = await apiFetch<{ user: SessionUserDto }>('/api/auth/login', {
        method: 'POST',
        json: values,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      toast.success(`Welcome back, ${user.name}`);
      router.push(next ?? '/dashboard');
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError) {
        setFormError(error.message);
        const details = error.details as Array<{ path: string; message: string }> | undefined;
        if (Array.isArray(details)) {
          for (const detail of details) {
            if (detail.path === 'email' || detail.path === 'password') {
              setError(detail.path as 'email' | 'password', { message: detail.message });
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
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Enter your credentials to access your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {formError ? (
            <div className="rounded-md border border-error/30 bg-error/5 px-3 py-2 text-xs text-error">
              {formError}
            </div>
          ) : null}

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
              autoComplete="current-password"
              disabled={isSubmitting}
              {...register('password')}
            />
            <FieldError>{errors.password?.message}</FieldError>
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            No account yet?{' '}
            <Link href="/register" className="font-medium text-foreground underline-offset-4 hover:underline">
              Create one
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
