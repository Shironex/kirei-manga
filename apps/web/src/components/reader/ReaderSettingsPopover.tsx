import type { FitMode, ReaderDirection, ReaderMode } from '@kireimanga/shared';
import { useT } from '@/hooks/useT';

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

export function ReaderSettingsPopover({ mode, direction, fit, onChange }: Props) {
  const t = useT();
  const directionDisabled = mode === 'webtoon';
  const fitDisabled = mode === 'webtoon';

  // Option lists are built inside the component so `t()` resolves against
  // the active language on each render. Mode/fit reuse the existing
  // settings.reader.* keys; direction uses short forms from reader.popover.*.
  const modeOptions: SegmentOption<ReaderMode>[] = [
    { value: 'single', label: t('settings.reader.mode.single') },
    { value: 'double', label: t('settings.reader.mode.double') },
    { value: 'webtoon', label: t('settings.reader.mode.webtoon') },
  ];

  const directionOptions: SegmentOption<ReaderDirection>[] = [
    { value: 'ltr', label: t('reader.popover.direction.ltr') },
    { value: 'rtl', label: t('reader.popover.direction.rtl') },
  ];

  const fitOptions: SegmentOption<FitMode>[] = [
    { value: 'width', label: t('settings.reader.fit.width') },
    { value: 'height', label: t('settings.reader.fit.height') },
    { value: 'original', label: t('settings.reader.fit.original') },
  ];

  return (
    <div
      role="dialog"
      aria-label={t('reader.settingsAria')}
      className="app-no-drag absolute top-12 right-4 z-10 w-[260px] border border-border bg-[var(--color-ink-raised)] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
    >
      <div className="flex flex-col gap-5">
        <Segment
          label={t('reader.popover.group.mode')}
          value={mode}
          options={modeOptions}
          onChange={v => onChange({ mode: v })}
        />
        <Segment
          label={t('reader.popover.group.direction')}
          value={direction}
          options={directionOptions}
          disabled={directionDisabled}
          onChange={v => onChange({ direction: v })}
        />
        <Segment
          label={t('reader.popover.group.fit')}
          value={fit}
          options={fitOptions}
          disabled={fitDisabled}
          onChange={v => onChange({ fit: v })}
        />
      </div>
    </div>
  );
}
