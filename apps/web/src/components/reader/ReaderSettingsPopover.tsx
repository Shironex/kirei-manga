import type { FitMode, ReaderDirection, ReaderMode } from '@kireimanga/shared';

interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentProps<T extends string> {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}

function Segment<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: SegmentProps<T>) {
  return (
    <div className={`flex flex-col gap-2 ${disabled ? 'opacity-40' : ''}`}>
      <span className="font-mono text-[10px] tracking-[0.24em] text-[var(--color-bone-faint)] uppercase">
        {label}
      </span>
      <div className="flex flex-wrap items-baseline gap-x-4">
        {options.map(opt => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              className={[
                'app-no-drag relative px-0 py-1.5 text-[12.5px] tracking-wide transition-colors',
                active
                  ? 'text-foreground'
                  : 'text-[var(--color-bone-muted)] hover:text-foreground',
                disabled ? 'cursor-not-allowed' : '',
              ].join(' ')}
            >
              <span>{opt.label}</span>
              {active && (
                <span
                  aria-hidden
                  className="absolute right-0 -bottom-px left-0 block h-px bg-[var(--color-accent)]"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface Props {
  mode: ReaderMode;
  direction: ReaderDirection;
  fit: FitMode;
  onChange: (partial: { mode?: ReaderMode; direction?: ReaderDirection; fit?: FitMode }) => void;
}

const MODES: SegmentOption<ReaderMode>[] = [
  { value: 'single', label: 'Single' },
  { value: 'double', label: 'Double' },
  { value: 'webtoon', label: 'Webtoon' },
];

const DIRECTIONS: SegmentOption<ReaderDirection>[] = [
  { value: 'ltr', label: 'LTR' },
  { value: 'rtl', label: 'RTL' },
];

const FITS: SegmentOption<FitMode>[] = [
  { value: 'width', label: 'Width' },
  { value: 'height', label: 'Height' },
  { value: 'original', label: 'Original' },
];

export function ReaderSettingsPopover({ mode, direction, fit, onChange }: Props) {
  const directionDisabled = mode === 'webtoon';
  const fitDisabled = mode === 'webtoon';

  return (
    <div
      role="dialog"
      aria-label="Reader settings"
      className="app-no-drag absolute top-12 right-4 z-10 w-[260px] border border-border bg-[var(--color-ink-raised)] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
    >
      <div className="flex flex-col gap-5">
        <Segment
          label="Mode"
          value={mode}
          options={MODES}
          onChange={v => onChange({ mode: v })}
        />
        <Segment
          label="Direction"
          value={direction}
          options={DIRECTIONS}
          disabled={directionDisabled}
          onChange={v => onChange({ direction: v })}
        />
        <Segment
          label="Fit"
          value={fit}
          options={FITS}
          disabled={fitDisabled}
          onChange={v => onChange({ fit: v })}
        />
      </div>
    </div>
  );
}
