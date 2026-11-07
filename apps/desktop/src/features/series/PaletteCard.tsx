import { Switch } from '@/components/ui/switch';
import type { Oklch, Palette } from '@/lib/library';
import { useSetting } from '@/lib/settings/store';
import { seedFromPalette } from '@/lib/theme/coverTheme';
import { cn } from '@/lib/utils';

const css = (c: Oklch) => `oklch(${c.l.toFixed(3)} ${c.c.toFixed(3)} ${c.h.toFixed(1)})`;
const label = (c: Oklch) => `oklch(${Math.round(c.l * 100)}% ${c.c.toFixed(3)} ${Math.round(c.h)})`;

const SWATCH_NAMES = ['Dark', 'Mid', 'Seed', 'Second hue', 'Light'];

/**
 * What the theme took from this cover: the five swatches the scanner sampled,
 * the roles derived from the seed, and the switch for cover colours.
 */
export function PaletteCard({ palette }: { palette: Palette | null }) {
  const [enabled, setEnabled] = useSetting('appearance.coverColours');
  const seed = seedFromPalette(palette);
  const fallback = palette?.fallback ?? true;

  return (
    <section
      aria-labelledby="palette-heading"
      className="rounded-panel border border-line bg-ink-1 p-6"
    >
      <h2
        id="palette-heading"
        className="m-0 mb-1 font-display text-lg leading-tight font-[650] font-condensed"
      >
        Theme from this cover
      </h2>
      <p className="m-0 mb-4 text-sm text-fg-3">
        {!palette
          ? 'No cover yet, so the theme keeps its default colours.'
          : fallback
            ? 'This cover has no strong colour, so the theme stays calm.'
            : 'Sampled from the cover art when the folder was scanned.'}
      </p>
      {palette && palette.swatches.length > 0 && (
        <ul className="m-0 mb-4 grid list-none grid-cols-5 gap-1.5 p-0" aria-label="Cover swatches">
          {palette.swatches.map((swatch, i) => (
            <li
              key={i}
              title={`${SWATCH_NAMES[i] ?? 'Swatch'}: ${label(swatch)}`}
              aria-label={`${SWATCH_NAMES[i] ?? 'Swatch'} ${label(swatch)}`}
              className={cn(
                'relative aspect-[1/1.3] rounded-lg shadow-[inset_0_0_0_1px_oklch(1_0_0/0.08)]',
                i === 2 &&
                  "after:absolute after:bottom-[7px] after:left-1/2 after:size-1.5 after:-translate-x-1/2 after:rounded-full after:bg-fg-1 after:shadow-[0_0_0_2px_oklch(0_0_0/0.35)] after:content-['']"
              )}
              style={{ background: css(swatch) }}
            />
          ))}
        </ul>
      )}
      <dl className="m-0 mb-4 grid gap-2 text-xs">
        {[
          ['Seed', css({ l: 0.6, ...seed }), label({ l: 0.6, ...seed })],
          ['Accent', 'var(--accent)', 'oklch(82% c h)'],
          ['Surface', 'var(--ink-0)', 'oklch(13% c×0.09 h)'],
          ['Ambient', 'oklch(0.5 var(--accent-c) var(--seed-h))', 'blurred cover, dimmed'],
        ].map(([name, colour, value]) => (
          <div key={name} className="grid grid-cols-[14px_72px_minmax(0,1fr)] items-center gap-2.5">
            <i
              aria-hidden
              className="size-3.5 rounded shadow-[inset_0_0_0_1px_oklch(1_0_0/0.1)] transition-[background] duration-theme"
              style={{ background: colour }}
            />
            <dt className="text-fg-3">{name}</dt>
            <dd className="m-0 truncate font-mono text-[11px] text-fg-2">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center justify-between gap-3 border-t border-line pt-4 text-sm">
        <label htmlFor="cover-colours" className="cursor-pointer">
          Use cover colours
        </label>
        <Switch
          id="cover-colours"
          checked={enabled}
          onCheckedChange={v => setEnabled(v).catch(() => undefined)}
        />
      </div>
    </section>
  );
}
