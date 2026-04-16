import { useMemo } from 'react';
import { useToastStore } from '@/stores/toast-store';

interface ToastOptions {
  title?: string;
  ttlMs?: number;
}

export interface UseToastResult {
  info: (body: string, opts?: ToastOptions) => string;
  error: (body: string, opts?: ToastOptions) => string;
  success: (body: string, opts?: ToastOptions) => string;
  dismiss: (id: string) => void;
}

/**
 * Stable toast helpers. Pulls the store via `getState()` so callers don't
 * subscribe to the toasts array and re-render on every show/dismiss.
 */
export function useToast(): UseToastResult {
  return useMemo<UseToastResult>(
    () => ({
      info: (body, opts) =>
        useToastStore.getState().show({ variant: 'info', body, ...opts }),
      error: (body, opts) =>
        useToastStore.getState().show({ variant: 'error', body, ...opts }),
      success: (body, opts) =>
        useToastStore.getState().show({ variant: 'success', body, ...opts }),
      dismiss: (id: string) => useToastStore.getState().dismiss(id),
    }),
    []
  );
}
