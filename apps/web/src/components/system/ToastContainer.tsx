import { useToastStore } from '@/stores/toast-store';
import { Toast } from './Toast';

export function ToastContainer() {
  const toasts = useToastStore(s => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <ol
      role="region"
      aria-label="Notifications"
      className="app-no-drag fixed right-6 bottom-6 z-50 flex w-[320px] flex-col gap-2"
    >
      {toasts.map(t => (
        <Toast key={t.id} toast={t} />
      ))}
    </ol>
  );
}
