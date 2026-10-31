export default function AuthLayout({ children }: { children: React.ReactNode }) {
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
