import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth-server';
import { AppShell } from '@/components/layout/app-shell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  return (
    <AppShell user={{ name: user.name, email: user.email, timezone: user.timezone }} demo={process.env.DEMO_MODE === 'true'}>
      {children}
    </AppShell>
  );
}