import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-tight',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        muted: 'border-transparent bg-muted text-muted-foreground',
        outline: 'border-border text-muted-foreground',
        success: 'border-transparent bg-success/12 text-success',
        warning: 'border-transparent bg-warning/15 text-warning',
        error: 'border-transparent bg-error/12 text-error',
        info: 'border-transparent bg-chart-1/12 text-chart-1',
      },
    },
    defaultVariants: { variant: 'muted' },
  },
);

export function Badge({ className, variant, ...props }: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

const STATUS_VARIANT: Record<string, VariantProps<typeof badgeVariants>['variant']> = {
  DRAFT: 'muted',
  READY: 'outline',
  UPLOADING: 'info',
  PROCESSING: 'info',
  SCHEDULED: 'info',
  PENDING: 'info',
  QUEUED: 'info',
  PUBLISHING: 'warning',
  PUBLISHED: 'success',
  FAILED: 'error',
  CANCELLED: 'muted',
  MANUAL_ACTION_REQUIRED: 'warning',
  CONNECTED: 'success',
  EXPIRED: 'warning',
  DISCONNECTED: 'muted',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'muted'} className={className}>
      {status.replaceAll('_', ' ').toLowerCase()}
    </Badge>
  );
}