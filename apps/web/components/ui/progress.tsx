import { cn } from '@/lib/utils';

export function Progress({
  value,
  max = 100,
  className,
  indicatorClassName,
}: {
  value: number;
  max?: number;
  className?: string;
  indicatorClassName?: string;
}) {
  const percent = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className={cn('h-full rounded-full bg-primary transition-[width] duration-500', indicatorClassName)}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />;
}