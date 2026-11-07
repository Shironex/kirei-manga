import * as React from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

import { Button } from './button';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

/**
 * For decisions that must interrupt (confirm a delete, pick a folder on first
 * run). Prefer inline UI everywhere else.
 */
function DialogContent({
  className,
  children,
  hideClose = false,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { hideClose?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-slot="dialog-overlay"
        className="fixed inset-0 z-40 bg-[oklch(0.08_calc(var(--tint)*0.5)_var(--seed-h)/0.72)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
      />
      <DialogPrimitive.Content
        data-slot="dialog"
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid w-[min(480px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 gap-4',
          'rounded-panel border border-line bg-ink-1 p-6 shadow-[0_40px_80px_-30px_oklch(0_0_0/0.8)] outline-none',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97]',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97]',
          className
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close asChild>
            <Button
              variant="quiet"
              size="icon-sm"
              aria-label="Close"
              className="absolute top-4 right-4"
            >
              <X />
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('grid gap-1.5 pr-8', className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('mt-2 flex justify-end gap-2', className)} {...props} />;
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('m-0 font-display text-xl font-[650] font-condensed', className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description className={cn('m-0 text-sm text-fg-2', className)} {...props} />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
