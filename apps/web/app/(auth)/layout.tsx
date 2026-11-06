import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth-server';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // Validates against the database, not just cookie presence, so a stale cookie lands here
  // instead of ping-ponging against the dashboard layout.
  const user = await getSessionUser();
  if (user) redirect('/dashboard');

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-grid px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-lg font-semibold tracking-tight">TikTok Scheduler</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Schedule, queue and auto-publish — without the burnout.
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
