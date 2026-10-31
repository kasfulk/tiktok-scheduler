'use client';

import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Accessible modal built on the native `<dialog>` element — focus trap, Escape handling and
 * backdrop come from the platform, no Radix dependency.
 */
export function Dialog({
  open,
  onOpenChange,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);

  return (
    <dialog
      ref={ref}
      onClose={handleClose}
      onClick={(event) => {
        if (event.target === ref.current) handleClose();
      }}
      className={cn(
        'w-full max-w-lg rounded-xl border border-border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-black/50',
        'open:animate-in open:fade-in-0',
        className,
      )}
    >
      <div className="relative">
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close dialog"
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
        {children}
      </div>
    </dialog>
  );
}

export function DialogHeader({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1 p-5 pb-2">{children}</div>;
}

export function DialogTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-base font-semibold tracking-tight">{children}</h2>;
}

export function DialogDescription({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

export function DialogBody({ children }: { children: ReactNode }) {
  return <div className="px-5 py-2">{children}</div>;
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-end gap-2 p-5 pt-3">{children}</div>;
}

/** Controlled confirm dialog for destructive actions. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  onConfirm,
  destructive = true,
  pending = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  destructive?: boolean;
  pending?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-md">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="h-9 rounded-md border border-border px-4 text-sm font-medium hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onConfirm}
          className={cn(
            'h-9 rounded-md px-4 text-sm font-medium text-white disabled:opacity-50',
            destructive ? 'bg-error hover:bg-error/90' : 'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
        >
          {confirmLabel}
        </button>
      </DialogFooter>
    </Dialog>
  );
}