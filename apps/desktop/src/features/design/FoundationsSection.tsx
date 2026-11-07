import { Caption, Section } from './Section';

const TYPE_ROWS = [
  {
    token: '--t-6xl / 72',
    note: 'Display, wdth 75',
    className: 'font-display text-6xl font-[750] tracking-[-0.02em]',
    style: { fontVariationSettings: "'wdth' 75, 'opsz' 96" },
    sample: 'Tsukiyo no Shoten',
  },
  {
    token: '--t-5xl / 52',
    note: 'Series title, wdth 76',
    className: 'font-display text-5xl font-[750] tracking-[-0.015em]',
    style: { fontVariationSettings: "'wdth' 76, 'opsz' 96" },
    sample: 'Wiedźma z Bieszczad',
  },
  {
    token: '--t-4xl / 36',
    note: 'Page title, wdth 80',
    className: 'font-display text-4xl font-bold tracking-[-0.01em]',
    style: { fontVariationSettings: "'wdth' 80, 'opsz' 72" },
    sample: 'Library',
  },
  {
    token: '--t-2xl / 23',
    note: 'Section, wdth 88',
    className: 'font-display text-2xl font-[650] font-condensed',
    sample: 'Continue reading',
  },
  { token: '--t-xl / 19', note: 'Onest', className: 'text-xl', sample: 'Chapter 42, page 12' },
  {
    token: '--t-lg / 16',
    note: 'Onest',
    className: 'text-lg',
    sample: 'Pages are resized in Rust before they reach the screen.',
  },
  {
    token: '--t-md / 14',
    note: 'Onest, base UI',
    className: 'text-md',
    sample: 'Chapters are written as CBZ archives with ComicInfo.xml.',
  },
  {
    token: '--t-sm / 13',
    note: 'Onest',
    className: 'text-sm text-fg-2',
    sample: '12 series, 1,284 chapters on disk',
  },
  {
    token: '--t-xs / 12',
    note: 'Onest, meta',
    className: 'text-xs text-fg-3',
    sample: 'Ch. 42 of 58, 2 new',
  },
  {
    token: '--f-jp',
    note: 'Shippori Mincho 600',
    className: 'text-2xl tracking-[0.08em] text-fg-2',
    sample: '月夜の書店',
    lang: 'ja',
  },
  {
    token: '--f-mono',
    note: 'JetBrains Mono',
    className: 'font-mono text-sm text-fg-2',
    sample: '~/Manga/Tsukiyo no Shoten/ch042.cbz',
  },
];

const SPACE = [
  ['--s-1', 4],
  ['--s-2', 8],
  ['--s-3', 12],
  ['--s-4', 16],
  ['--s-5', 24],
  ['--s-6', 32],
  ['--s-7', 48],
  ['--s-8', 64],
  ['--s-9', 96],
] as const;

const RADII = [
  { token: '--r-cover', value: '4px', use: 'Covers', className: 'rounded-cover' },
  { token: '--r-chip', value: '6px', use: 'Chips, tags', className: 'rounded-chip' },
  { token: '--r-panel', value: '14px', use: 'Panels', className: 'rounded-panel' },
  { token: '--r-pill', value: '999px', use: 'Actions', className: 'rounded-pill' },
];

const MOTION = [
  { token: '--d-1 120ms', note: 'Press feedback', className: 'duration-fast ease-expo' },
  { token: '--d-2 200ms', note: 'Hover, toggles', className: 'duration-base ease-expo' },
  { token: '--d-3 320ms', note: 'Panels, view enter', className: 'duration-slow ease-expo' },
  {
    token: '--d-theme 900ms',
    note: 'Cover palette crossfade',
    className: 'duration-theme ease-theme',
  },
];

export function FoundationsSection() {
  return (
    <>
      <Section
        id="type"
        title="Type"
        lead="Bricolage Grotesque condensed for titles, Onest for the interface, Shippori Mincho for Japanese titles, JetBrains Mono for paths and numbers."
      >
        <div className="grid">
          {TYPE_ROWS.map(row => (
            <div
              key={row.token}
              className="grid grid-cols-[160px_minmax(0,1fr)] items-baseline gap-6 border-t border-line py-4"
            >
              <div className="grid">
                <Caption>{row.token}</Caption>
                <span className="text-xs text-fg-3">{row.note}</span>
              </div>
              <div
                lang={row.lang}
                className={`m-0 min-w-0 truncate ${row.className}`}
                style={row.style}
              >
                {row.sample}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="space"
        title="Space and radius"
        lead="A 4 px base; Tailwind's spacing step is set to the same 4 px. Radius follows one rule: covers 4, chips 6, panels 14, actions pill."
      >
        <div className="mb-10 grid gap-2.5">
          {SPACE.map(([token, px]) => (
            <div
              key={token}
              className="grid grid-cols-[80px_48px_minmax(0,1fr)] items-center gap-4"
            >
              <Caption>{token}</Caption>
              <Caption>{px}px</Caption>
              <i className="block h-2.5 rounded-xs bg-accent" style={{ width: px * 3 }} />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-6">
          {RADII.map(r => (
            <div key={r.token} className="grid justify-items-start gap-2">
              <i
                className={`block h-[72px] w-24 border border-line-strong bg-ink-2 ${r.className}`}
              />
              <b className="font-mono text-xs font-medium">{r.token}</b>
              <span className="text-xs text-fg-3">
                {r.value}, {r.use}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="motion"
        title="Motion"
        lead="Expo-out for interaction, ease-in-out for the palette crossfade. Hover a card to run it. With reduced motion every duration but press feedback collapses to 1 ms."
      >
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
          {MOTION.map(m => (
            <div
              key={m.token}
              tabIndex={0}
              className="group flex flex-col rounded-xl border border-line bg-ink-1 p-4"
            >
              <b className="font-mono text-xs font-medium">{m.token}</b>
              <p className="m-0 mt-1 mb-3 flex-1 text-xs text-fg-3">{m.note}</p>
              <div className="@container relative h-7 rounded-pill bg-ink-2">
                <i
                  className={`absolute top-1 left-1 size-5 rounded-full bg-accent transition-transform group-hover:translate-x-[calc(100cqw-28px)] group-focus-visible:translate-x-[calc(100cqw-28px)] ${m.className}`}
                />
              </div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
