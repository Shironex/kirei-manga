import { useMemo, useState } from 'react';
import { ChevronDown, Eye, EyeOff } from 'lucide-react';
import type { TranslationProviderId } from '@kireimanga/shared';
import { useT } from '@/hooks/useT';

/**
 * Form primitives shared between the global Translation settings panel
 * (Slice H.1) and the per-series translation override form (Slice H.2).
 *
 * Lifted here once a second consumer landed — no behavioural changes;
 * `TranslationSection.tsx` re-imports them and renders identically.
 */

/**
 * Providers exposed in the dropdown. `tesseract-only` is OCR-only and never
 * selectable as a default translation backend — keep the union closed here so
 * the dropdown matches the runtime registry.
 */
export const PROVIDER_OPTIONS: ReadonlyArray<{
  value: Exclude<TranslationProviderId, 'tesseract-only'>;
  labelKey: string;
}> = [
  { value: 'deepl', labelKey: 'settings.translation.provider.deepl' },
  { value: 'google', labelKey: 'settings.translation.provider.google' },
  { value: 'ollama', labelKey: 'settings.translation.provider.ollama' },
];

export type DisplayProviderId = (typeof PROVIDER_OPTIONS)[number]['value'];

export function ToggleSwitch({
  checked,
  onChange,
  ariaLabel,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-border transition-colors',
        checked ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-ink-sunken)]',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
      ].join(' ')}
    >
      <span
        aria-hidden
        className={[
          'inline-block h-3 w-3 transform rounded-full bg-[var(--color-bone)] transition-transform',
          checked ? 'translate-x-5' : 'translate-x-1',
        ].join(' ')}
      />
    </button>
  );
}

export function ProviderSelect({
  value,
  disabled,
  ariaLabel,
  onChange,
  t,
  testId,
}: {
  value: TranslationProviderId;
  disabled: boolean;
  ariaLabel: string;
  onChange: (next: DisplayProviderId) => void;
  t: ReturnType<typeof useT>;
  testId?: string;
}) {
  // The store can hold `tesseract-only` in theory, but we don't expose it as a
  // selectable option — the select still needs a string to render, so fall
  // back to `deepl` for display purposes only (no patch is fired).
  const displayValue: DisplayProviderId = useMemo(() => {
    return PROVIDER_OPTIONS.some(o => o.value === value) ? (value as DisplayProviderId) : 'deepl';
  }, [value]);

  return (
    <div className="relative">
      <select
        aria-label={ariaLabel}
        value={displayValue}
        disabled={disabled}
        onChange={e => onChange(e.target.value as DisplayProviderId)}
        data-testid={testId ?? 'translation-default-provider'}
        className="h-8 appearance-none rounded-sm border border-border bg-[var(--color-ink-sunken)] px-2.5 pr-7 font-mono text-[11px] tracking-[0.06em] text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        {PROVIDER_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>
            {t(o.labelKey)}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-bone-faint)]"
        aria-hidden
      />
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  disabled,
  ariaLabel,
  widthClass = 'w-40',
  ...rest
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel: string;
  widthClass?: string;
  [key: `data-${string}`]: string;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={e => onChange(e.target.value)}
      spellCheck={false}
      autoComplete="off"
      className={[
        'h-8 rounded-sm border border-border bg-[var(--color-ink-sunken)] px-2.5 font-mono text-[11px] tracking-[0.06em] text-foreground placeholder:text-[var(--color-bone-faint)] disabled:cursor-not-allowed disabled:opacity-50',
        widthClass,
      ].join(' ')}
      {...rest}
    />
  );
}

export function PasswordInput({
  value,
  onChange,
  placeholder,
  disabled,
  ariaLabel,
  ...rest
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel: string;
  [key: `data-${string}`]: string;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="relative inline-flex">
      <input
        type={revealed ? 'text' : 'password'}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={e => onChange(e.target.value)}
        spellCheck={false}
        autoComplete="off"
        className="h-8 w-72 rounded-sm border border-border bg-[var(--color-ink-sunken)] px-2.5 pr-9 font-mono text-[11px] tracking-[0.06em] text-foreground placeholder:text-[var(--color-bone-faint)] disabled:cursor-not-allowed disabled:opacity-50"
        {...rest}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => setRevealed(v => !v)}
        aria-label={revealed ? 'Hide value' : 'Show value'}
        aria-pressed={revealed}
        className="absolute top-1/2 right-1 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-sm text-[var(--color-bone-faint)] transition-colors enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

export function OpacitySlider({
  value,
  disabled,
  onChange,
  ariaLabel,
  testId,
}: {
  value: number;
  disabled: boolean;
  onChange: (next: number) => void;
  ariaLabel: string;
  testId?: string;
}) {
  // Settings store the value as 0–1; the slider operates on whole percents to
  // make the UI feel snappy. Round on commit so we never persist floats with
  // jitter like 0.6700000000000001.
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="inline-flex items-center gap-3">
      <input
        type="range"
        min={0}
        max={100}
        value={percent}
        disabled={disabled}
        aria-label={ariaLabel}
        data-testid={testId ?? 'translation-overlay-opacity'}
        onChange={e => onChange(Number(e.target.value) / 100)}
        className="h-1 w-40 cursor-pointer appearance-none rounded-full bg-[var(--color-ink-sunken)] disabled:cursor-not-allowed disabled:opacity-50"
      />
      <span className="font-mono text-[11px] tabular-nums text-[var(--color-bone-muted)]">
        {percent}%
      </span>
    </div>
  );
}
