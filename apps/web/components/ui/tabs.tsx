'use client';

import { cn } from '@/lib/utils';

export interface TabItem {
  value: string;
  label: string;
  count?: number;
}

export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: readonly TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn('inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1', className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors',
              active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
            {typeof item.count === 'number' ? (
              <span className="tabular text-[10px] text-muted-foreground">{item.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}