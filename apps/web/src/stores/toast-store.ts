import { create } from 'zustand';
import { createLogger } from '@kireimanga/shared';

const logger = createLogger('ToastStore');

const DEFAULT_TTL_INFO = 5000;
const DEFAULT_TTL_SUCCESS = 5000;
const DEFAULT_TTL_ERROR = 8000;

export type ToastVariant = 'info' | 'error' | 'success';

export interface Toast {
  id: string;
  variant: ToastVariant;
  title?: string;
  body: string;
  createdAt: number;
  ttlMs: number;
}

export interface ToastInput {
  variant: ToastVariant;
  title?: string;
  body: string;
  ttlMs?: number;
}

interface ToastState {
  toasts: Toast[];
}

interface ToastActions {
  show: (input: ToastInput) => string;
  dismiss: (id: string) => void;
}

type ToastStore = ToastState & ToastActions;

function defaultTtl(variant: ToastVariant): number {
  switch (variant) {
    case 'error':
      return DEFAULT_TTL_ERROR;
    case 'success':
      return DEFAULT_TTL_SUCCESS;
    case 'info':
    default:
      return DEFAULT_TTL_INFO;
  }
}

export const useToastStore = create<ToastStore>()((set, get) => ({
  toasts: [],

  show: (input: ToastInput) => {
    const id = crypto.randomUUID();
    const toast: Toast = {
      id,
      variant: input.variant,
      title: input.title,
      body: input.body,
      createdAt: Date.now(),
      ttlMs: input.ttlMs ?? defaultTtl(input.variant),
    };
    logger.debug(`show ${input.variant}`, toast.title ?? toast.body);
    set(state => ({ toasts: [...state.toasts, toast] }));
    return id;
  },

  dismiss: (id: string) => {
    if (!get().toasts.some(t => t.id === id)) return;
    set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }));
  },
}));
