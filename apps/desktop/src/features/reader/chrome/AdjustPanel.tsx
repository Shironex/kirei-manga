import { useId, type ReactNode } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';

import { RANGES, type Adjustments, type NumericAdjustment, type Resample } from '../model/adjust';
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

/** A labelled slider with its value in percent, as in the prototype. */
function PanelRange({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: NumericAdjustment;
  value: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const [min, max] = RANGES[name];
  return (
    <div className="grid gap-1">
      <div className="flex justify-between text-sm text-fg-2">
        <span id={id}>{label}</span>
        <output className="text-fg-1 tabular">{value}%</output>
      </div>
      <Slider
        aria-labelledby={id}
        value={[value]}
        min={min}
        max={max}
        step={1}
        onValueChange={([next]) => {
          if (next !== undefined) onChange(next);
        }}
      />
    </div>
  );
}

const RESAMPLE_OPTIONS = [
  ['lanczos3', 'Lanczos3'],
  ['mitchell', 'Mitchell'],
  ['nearest', 'Nearest'],
] as const satisfies ReadonlyArray<readonly [Resample, string]>;

/** Header of the panel: the title and Reset. */
export function AdjustHeader({ onReset, canReset }: { onReset: () => void; canReset: boolean }) {
  return (
    <h3 className="m-0 mb-4 flex items-center justify-between font-display text-lg leading-none font-[650] font-condensed">
      Adjust
      <Button variant="ghost" size="sm" onClick={onReset} disabled={!canReset}>
        Reset
      </Button>
    </h3>
  );
}

/**
 * The image adjustments: tone sliders, then a group with night reading,
 * grayscale, the resampling filter and `children` (the layout settings).
 * Sharpen and resampling re-render pages in the pipeline, the rest is a CSS
 * filter that follows the slider live.
 */
export function ImageSettings({
  adjustments,
  onChange,
  children,
}: {
  adjustments: Adjustments;
  onChange: (patch: Partial<Adjustments>) => void;
  children?: ReactNode;
}) {
  const range = (name: NumericAdjustment, label: string) => (
    <PanelRange
      label={label}
      name={name}
      value={adjustments[name]}
      onChange={value => onChange({ [name]: value })}
    />
  );
  return (
    <>
      <div className="grid gap-3">
        {range('brightness', 'Brightness')}
        {range('contrast', 'Contrast')}
        {range('saturation', 'Saturation')}
        {range('sharpen', 'Sharpen')}
        {range('warmth', 'Warmth')}
      </div>
      <div className="mt-2 grid gap-3 border-t border-line pt-4">
        <PanelLine label="Invert for night reading">
          {id => (
            <Switch
              id={id}
              checked={adjustments.invert}
              onCheckedChange={invert => onChange({ invert })}
            />
          )}
        </PanelLine>
        <PanelLine label="Grayscale">
          {id => (
            <Switch
              id={id}
              checked={adjustments.grayscale}
              onCheckedChange={grayscale => onChange({ grayscale })}
            />
          )}
        </PanelLine>
        <PanelLine label="Resampling">
          {id => (
            <Choice
              id={id}
              value={adjustments.resample}
              options={RESAMPLE_OPTIONS}
              onChange={resample => onChange({ resample })}
            />
          )}
        </PanelLine>
        {children}
      </div>
    </>
  );
}

/** The last line of the panel, for a library series only. */
export function RememberLine({
  remember,
  onChange,
}: {
  remember: boolean;
  onChange: (remember: boolean) => void;
}) {
  return (
    <PanelLine label="Remember for this series">
      {id => <Switch id={id} checked={remember} onCheckedChange={onChange} />}
    </PanelLine>
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
