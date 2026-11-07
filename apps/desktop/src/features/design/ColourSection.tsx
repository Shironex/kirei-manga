import { useMemo } from 'react';
import { Check, X } from 'lucide-react';

import tokensCss from '@/styles/tokens.css?raw';
import { contrastRatio, makeResolver, parseRootTokens, type Rgba } from '@/lib/theme/contrast';
import { CONTRAST_PAIRS } from '@/lib/theme/pairs';
import { STRENGTH_SCALE, type Seed, type Strength } from '@/lib/theme/seed';
import { cn } from '@/lib/utils';

import { Section } from './Section';

const tokens = parseRootTokens(tokensCss);

type Swatch = { name: string; formula: string; use: string };

const GROUPS: { title: string; swatches: Swatch[] }[] = [
  {
    title: 'Ink',
    swatches: [
      { name: '--ink-0', formula: 'oklch(13% tint h)', use: 'App background' },
      { name: '--ink-1', formula: 'oklch(16.5% tint h)', use: 'Rail, panels' },
      { name: '--ink-2', formula: 'oklch(20.5% tint h)', use: 'Controls' },
      { name: '--ink-3', formula: 'oklch(25.5% tint h)', use: 'Hover, tracks' },
      { name: '--ink-stage', formula: 'oklch(10% tint/2 h)', use: 'Reader stage' },
    ],
  },
  {
    title: 'Text',
    swatches: [
      { name: '--fg-1', formula: 'oklch(96% 0.006 h)', use: 'Primary text' },
      { name: '--fg-2', formula: 'oklch(80% 0.012 h)', use: 'Secondary' },
      { name: '--fg-3', formula: 'oklch(66% 0.014 h)', use: 'Meta' },
    ],
  },
  {
    title: 'From the cover',
    swatches: [
      { name: '--accent', formula: 'oklch(82% c h)', use: 'Actions, selection' },
      { name: '--accent-strong', formula: 'oklch(72% c h)', use: 'Pressed, fills' },
      { name: '--accent-wash', formula: 'accent / 14%', use: 'Selected fills' },
      { name: '--on-accent', formula: 'oklch(20% c/2 h)', use: 'Text on accent' },
      { name: '--ambient', formula: 'oklch(50% c h / 42%)', use: 'Backdrop glow' },
    ],
  },
  {
    title: 'Semantic, never from the cover',
    swatches: [
      { name: '--ok', formula: 'oklch(80% 0.13 155)', use: 'Done, offline' },
      { name: '--warn', formula: 'oklch(84% 0.13 82)', use: 'Attention' },
      { name: '--err', formula: 'oklch(72% 0.16 25)', use: 'Failed, destructive' },
    ],
  },
];

const hex = ({ r, g, b }: Rgba) =>
  '#' +
  [r, g, b]
    .map(v =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('');

function SwatchTile({ swatch }: { swatch: Swatch }) {
  return (
    <figure className="m-0 overflow-hidden rounded-xl border border-line bg-ink-1">
      <div
        className="h-16 border-b border-line"
        style={{ background: `var(${swatch.name})` }}
        aria-hidden
      />
      <figcaption className="grid gap-0.5 px-3 py-2.5">
        <b className="font-mono text-xs font-medium text-fg-1">{swatch.name}</b>
        <code className="font-mono text-[11px] text-fg-3">{swatch.formula}</code>
        <small className="text-xs text-fg-2">{swatch.use}</small>
      </figcaption>
    </figure>
  );
}

export function ColourSection({ seed, strength }: { seed: Seed; strength: Strength }) {
  const rows = useMemo(() => {
    const color = makeResolver(tokens, { ...seed, strength: STRENGTH_SCALE[strength] });
    return CONTRAST_PAIRS.map(pair => {
      const fg = color(...pair.fg);
      const bg = color(...pair.bg);
      return { pair, fg, bg, ratio: contrastRatio(fg, bg) };
    });
  }, [seed, strength]);

  return (
    <>
      <Section
        id="colour"
        title="Colour"
        lead="One seed hue and one seed chroma come from the cover. Every surface, accent and glow derives from them in OKLCH, so lightness and contrast stay put while the colour changes."
      >
        <pre className="m-0 mb-6 overflow-x-auto rounded-xl border border-line bg-ink-1 px-5 py-4 font-mono text-[12.5px] leading-[1.8] text-fg-2">
          {`seed      = dominant vivid hue of the cover  ->  h, c (cap 0.17)\nsurface   = oklch(13%  c x 0.09 x strength  h)\naccent    = oklch(82%  clamp(0.045, c x strength, 0.17)  h)\non-accent = oklch(20%  accent-c x 0.5  h)`}
        </pre>
        {GROUPS.map(group => (
          <div key={group.title} className="mb-6">
            <h3 className="m-0 mb-3 text-sm font-medium text-fg-3">{group.title}</h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3">
              {group.swatches.map(s => (
                <SwatchTile key={s.name} swatch={s} />
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section
        id="contrast"
        title="Contrast"
        lead="Measured live for the current seed from tokens.css. The same pairs run in CI for every hue, chroma and strength, and fail the build below WCAG AA."
      >
        <div className="overflow-hidden rounded-panel border border-line">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-ink-1 text-left text-xs text-fg-3">
                <th className="px-4 py-2.5 font-medium">Sample</th>
                <th className="px-4 py-2.5 font-medium">Use</th>
                <th className="px-4 py-2.5 font-medium">Pair</th>
                <th className="px-4 py-2.5 text-right font-medium">Ratio</th>
                <th className="px-4 py-2.5 text-right font-medium">Needs</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ pair, fg, bg, ratio }) => {
                const pass = ratio >= pair.min;
                return (
                  <tr key={pair.use + pair.min} className="border-t border-line">
                    <td className="px-4 py-2">
                      <span
                        className="inline-grid h-7 w-14 place-items-center rounded-md text-xs font-semibold"
                        style={{ background: hex(bg), color: hex(fg) }}
                      >
                        Aa
                      </span>
                    </td>
                    <td className="px-4 py-2 text-fg-1">{pair.use}</td>
                    <td className="px-4 py-2 font-mono text-[11px] text-fg-3">
                      {pair.fg.join(' + ')} on {pair.bg.join(' + ')}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs tabular">
                      {ratio.toFixed(2)}:1
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 text-xs font-medium',
                          pass ? 'text-ok' : 'text-err'
                        )}
                      >
                        {pass ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                        {pair.min}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
