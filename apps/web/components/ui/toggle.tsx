'use client';

import { cn } from '@/lib/utils';

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  id,
  label,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  label: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50',
        checked ? 'border-transparent bg-primary' : 'border-border bg-muted',
      )}
    >
      <span
        className={cn(
          'pointer-events-none block size-3.5 rounded-full bg-background shadow-sm transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-1',
          checked ? 'bg-primary-foreground' : 'bg-foreground/60',
        )}
      />
    </button>
  );
}

export function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      ref={(node) => {
        if (node) node.indeterminate = indeterminate && !checked;
      }}
      onChange={(event) => onChange(event.target.checked)}
      className={cn(
        'size-4 cursor-pointer rounded border-border accent-[var(--primary)] align-middle',
        className,
      )}
    />
  );
}