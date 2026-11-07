import { useEffect, useState } from 'react';

import { Switch } from '@/components/ui/switch';
import { Segmented, SegmentedItem } from '@/components/ui/segmented';
import {
  applySeed,
  DEFAULT_SEED,
  setGlass,
  setStrength,
  type Seed,
  type Strength,
} from '@/lib/theme/seed';
import { cn } from '@/lib/utils';

import { ColourSection } from './ColourSection';
import { ComponentsSection } from './ComponentsSection';
import { FoundationsSection } from './FoundationsSection';
import { SEED_PRESETS } from './seeds';

const SECTIONS = [
  { id: 'colour', label: 'Colour' },
  { id: 'contrast', label: 'Contrast' },
  { id: 'type', label: 'Type' },
  { id: 'space', label: 'Space and radius' },
  { id: 'motion', label: 'Motion' },
  { id: 'components', label: 'Components' },
] as const;

/**
 * Dev-only review page: every token and primitive, live against the cover seed.
 * Not shipped in production builds.
 */
export function DesignPage() {
  const [seed, setSeed] = useState<Seed>(DEFAULT_SEED);
  const [strength, setStrengthState] = useState<Strength>('balanced');
  const [glass, setGlassState] = useState(true);

  useEffect(() => applySeed(seed), [seed]);
  useEffect(() => setStrength(strength), [strength]);
  useEffect(() => setGlass(glass), [glass]);

  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-[180px_minmax(0,1fr)] gap-12 px-12 pt-8 pb-24">
      <nav
        aria-label="Design sections"
        className="sticky top-8 grid content-start gap-0.5 self-start"
      >
        <p className="mb-2 px-3 text-xs text-fg-3">Design system</p>
        {SECTIONS.map(s => (
          <a
            key={s.id}
            href={`#ds-${s.id}`}
            className="rounded-lg px-3 py-2 text-sm text-fg-2 no-underline transition-colors duration-base hover:bg-ink-2 hover:text-fg-1"
          >
            {s.label}
          </a>
        ))}
      </nav>

      <main className="min-w-0">
        <header className="mb-12">
          <h1 className="m-0 mb-2 font-display text-4xl font-bold font-condensed-tight tracking-[-0.01em]">
            Design system
          </h1>
          <p className="m-0 max-w-[62ch] text-fg-2">
            Every token and primitive in KireiManga, rendered live. Pick a cover seed and the whole
            page follows it: lightness stays fixed per role, so contrast holds on every cover.
          </p>
        </header>

        <div className="sticky top-0 z-10 -mx-4 mb-12 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line bg-ink-0/90 px-4 py-3 backdrop-blur-md">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Cover seed">
            {SEED_PRESETS.map(p => {
              const on = p.seed.h === seed.h && p.seed.c === seed.c;
              return (
                <button
                  key={p.name}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSeed(p.seed)}
                  className={cn(
                    'inline-flex h-8 items-center gap-2 rounded-pill border bg-ink-1 pr-3 pl-1.5 text-sm transition-colors duration-base',
                    on ? 'border-accent text-fg-1' : 'border-line-strong text-fg-2 hover:text-fg-1'
                  )}
                >
                  <span
                    aria-hidden
                    className="size-5 rounded-full shadow-[inset_0_0_0_1px_oklch(1_0_0/0.12)]"
                    style={{ background: `oklch(0.62 ${p.seed.c} ${p.seed.h})` }}
                  />
                  {p.name}
                </button>
              );
            })}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-5">
            <Segmented
              aria-label="Strength"
              value={strength}
              onValueChange={v => setStrengthState(v as Strength)}
              size="sm"
            >
              <SegmentedItem value="subtle">Subtle</SegmentedItem>
              <SegmentedItem value="balanced">Balanced</SegmentedItem>
              <SegmentedItem value="vivid">Vivid</SegmentedItem>
            </Segmented>
            <label className="flex items-center gap-2.5 text-sm text-fg-2">
              <Switch checked={glass} onCheckedChange={setGlassState} />
              Glass
            </label>
          </div>
        </div>

        <ColourSection seed={seed} strength={strength} />
        <FoundationsSection />
        <ComponentsSection />
      </main>
    </div>
  );
}
