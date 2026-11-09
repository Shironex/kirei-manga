import { useId, useState } from 'react';
import { Languages, X } from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useSetting } from '@/lib/settings/store';
import { cn } from '@/lib/utils';

import { COMMON_LANGUAGES, languageLabel, toggleFallback, withPreferred } from './model';

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The reading language chain, editable wherever chapters are listed: the
 * preferred language, the fallbacks that fill its gaps (in order) and the
 * "only my language" switch. Writes the `online.*` settings, so every screen
 * and the Rust client follow at once.
 */
export function LanguagePicker({
  className,
  compact = false,
  extra = [],
}: {
  className?: string;
  /** One line for toolbars: the fallbacks collapse into their codes. */
  compact?: boolean;
  /** Languages to offer besides the common ones (a series' own languages). */
  extra?: readonly string[];
}) {
  const id = useId();
  const [chain, setChain] = useSetting('online.languages');
  const [only, setOnly] = useSetting('online.onlyMyLanguage');
  const [error, setError] = useState<string | null>(null);
  const preferred = chain[0] ?? 'pl';
  const fallbacks = chain.slice(1);
  const offered = [...new Set([...COMMON_LANGUAGES, ...extra, ...chain])];

  const save = (next: string[]) => {
    setError(null);
    setChain(next).catch((reason: unknown) => setError(message(reason)));
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 text-sm', className)}>
      <span id={`${id}-label`} className="flex items-center gap-1.5 text-fg-3">
        <Languages className="size-4" aria-hidden /> Read in
      </span>
      <Select value={preferred} onValueChange={code => save(withPreferred(chain, code))}>
        <SelectTrigger aria-labelledby={`${id}-label`} className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {offered.map(code => (
            <SelectItem key={code} value={code}>
              {languageLabel(code)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!only && (
        <span className="flex flex-wrap items-center gap-1.5" aria-label="Fallback languages">
          <span className="text-fg-3">then</span>
          {fallbacks.map(code => (
            <span
              key={code}
              className="inline-flex h-7 items-center gap-1 rounded-chip border border-line-strong pr-1 pl-2.5 text-xs text-fg-2"
            >
              {compact ? code.toUpperCase() : languageLabel(code)}
              <button
                type="button"
                aria-label={`Remove ${languageLabel(code)} as a fallback`}
                onClick={() => save(toggleFallback(chain, code))}
                className="grid size-5 place-items-center rounded-full text-fg-3 hover:bg-ink-3 hover:text-fg-1"
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
          {chain.length < 6 && (
            <Select value="" onValueChange={code => save(toggleFallback(chain, code))}>
              <SelectTrigger
                aria-label="Add a fallback language"
                className="h-7 min-w-0 px-2.5 text-xs"
              >
                <SelectValue placeholder={fallbacks.length ? 'Add' : 'Add a fallback'} />
              </SelectTrigger>
              <SelectContent>
                {offered
                  .filter(code => !chain.includes(code))
                  .map(code => (
                    <SelectItem key={code} value={code}>
                      {languageLabel(code)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
        </span>
      )}
      <label className="ml-auto flex items-center gap-2 text-fg-2">
        <Switch
          checked={only}
          onCheckedChange={next => {
            setError(null);
            setOnly(next).catch((reason: unknown) => setError(message(reason)));
          }}
        />
        Only {languageLabel(preferred)}
      </label>
      <p aria-live="polite" className="m-0 w-full empty:hidden">
        {error && <span className="text-xs text-err">Not saved: {error}</span>}
      </p>
    </div>
  );
}
