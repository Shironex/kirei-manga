import { useId, type ReactNode } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

import type { Background, Fit, ReaderMode, ReaderPrefs } from '../model/prefs';

/** A labelled control on one line of the panel. */
export function PanelLine({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-fg-2">
      <label htmlFor={id} className="grid">
        {label}
        {hint && <span className="text-xs text-fg-3">{hint}</span>}
      </label>
      {children(id)}
    </div>
  );
}

function Choice<T extends string>({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <Select value={value} onValueChange={next => onChange(next as T)}>
      <SelectTrigger id={id} className="min-w-[104px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([option, label]) => (
          <SelectItem key={option} value={option}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const FITS = [
  ['screen', 'Screen'],
  ['width', 'Width'],
  ['height', 'Height'],
  ['original', 'Original'],
] as const satisfies ReadonlyArray<readonly [Fit, string]>;

const BACKGROUNDS = [
  ['glow', 'Cover glow'],
  ['flat', 'Black'],
  ['tint', 'Cover tint'],
] as const satisfies ReadonlyArray<readonly [Background, string]>;

/** Layout settings: fit, the stage background and the double page options. */
export function LayoutSettings({
  prefs,
  mode,
  onChange,
}: {
  prefs: ReaderPrefs;
  mode: ReaderMode;
  onChange: (patch: Partial<ReaderPrefs>) => void;
}) {
  return (
    <>
      {mode !== 'webtoon' && (
        <PanelLine label="Fit">
          {id => (
            <Choice id={id} value={prefs.fit} options={FITS} onChange={fit => onChange({ fit })} />
          )}
        </PanelLine>
      )}
      <PanelLine label="Background">
        {id => (
          <Choice
            id={id}
            value={prefs.background}
            options={BACKGROUNDS}
            onChange={background => onChange({ background })}
          />
        )}
      </PanelLine>
      {mode === 'double' && (
        <>
          <PanelLine label="Wide pages alone">
            {id => (
              <Switch
                id={id}
                checked={prefs.detectSpreads}
                onCheckedChange={detectSpreads => onChange({ detectSpreads })}
              />
            )}
          </PanelLine>
          <PanelLine label="Cover on its own">
            {id => (
              <Switch
                id={id}
                checked={prefs.coverAlone}
                onCheckedChange={coverAlone => onChange({ coverAlone })}
              />
            )}
          </PanelLine>
          <PanelLine label="Shift spreads by one page" hint="S, when spreads look split">
            {id => (
              <Switch
                id={id}
                checked={prefs.shift}
                onCheckedChange={shift => onChange({ shift })}
              />
            )}
          </PanelLine>
        </>
      )}
    </>
  );
}

/** Floating glass panel under the bar's adjust button. */
export function AdjustPanel({ children }: { children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label="Image adjustments"
      data-testid="adjust-panel"
      className="glass absolute top-[76px] right-3 z-[4] max-h-[calc(100%-160px)] w-[300px] origin-top-right animate-pop overflow-y-auto rounded-panel p-6 max-md:left-3 max-md:w-auto"
    >
      {children}
    </div>
  );
}
