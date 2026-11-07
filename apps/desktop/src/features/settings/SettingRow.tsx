import { useCallback, useState, type ReactNode } from 'react';

import type { AppSettings, SettingKey } from '@/lib/settings/contract';
import { useSetting } from '@/lib/settings/store';
import { cn } from '@/lib/utils';

/** One settings section: a heading, an optional lead and its rows. */
export function SettingsSection({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={`settings-${id}`}
      aria-labelledby={`settings-${id}-title`}
      data-settings-section={id}
      className="mb-12 scroll-mt-6"
    >
      <h2
        id={`settings-${id}-title`}
        tabIndex={-1}
        className={cn(
          'm-0 font-display text-2xl font-[650] font-condensed',
          lead ? 'mb-2' : 'mb-4'
        )}
      >
        {title}
      </h2>
      {lead && <p className="m-0 mb-4 max-w-[60ch] text-sm text-fg-3">{lead}</p>}
      {children}
    </section>
  );
}

/** The panel rows sit in. */
export function SettingsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-panel border border-line bg-ink-1', className)}>{children}</div>
  );
}

/**
 * Name and help on the left, the control on the right. `id` ties the visible
 * label to the control (`htmlFor` for inputs, `aria-labelledby` via
 * `${id}-label` for groups). `error` shows under the help, announced politely.
 */
export function SettingRow({
  id,
  label,
  help,
  control,
  error,
  labelFor = true,
  className,
}: {
  id: string;
  label: ReactNode;
  help?: ReactNode;
  control: ReactNode;
  error?: string | null;
  /** False when the control is a group named through aria-labelledby. */
  labelFor?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 px-6 py-4 [&+&]:border-t [&+&]:border-line',
        className
      )}
    >
      <div className="min-w-0">
        {labelFor ? (
          <label htmlFor={id} id={`${id}-label`} className="block font-medium">
            {label}
          </label>
        ) : (
          <span id={`${id}-label`} className="block font-medium">
            {label}
          </span>
        )}
        {help && (
          <p id={`${id}-help`} className="m-0 mt-0.5 text-sm text-fg-3">
            {help}
          </p>
        )}
        <p aria-live="polite" className="m-0 empty:hidden">
          {error && <span className="mt-1 block text-sm text-err">{error}</span>}
        </p>
      </div>
      <div className="flex items-center gap-2">{control}</div>
    </div>
  );
}

/**
 * `useSetting` plus the message of the last refused write, for a row's
 * `error`. The setter never rejects; a refusal rolls back and shows here.
 */
export function useSettingControl<K extends SettingKey>(
  key: K
): [AppSettings[K], (value: AppSettings[K]) => void, string | null] {
  const [value, set] = useSetting(key);
  const [error, setError] = useState<string | null>(null);
  const change = useCallback(
    (next: AppSettings[K]) => {
      setError(null);
      set(next).catch((reason: unknown) =>
        setError(`Not saved: ${reason instanceof Error ? reason.message : String(reason)}`)
      );
    },
    [set]
  );
  return [value, change, error];
}
