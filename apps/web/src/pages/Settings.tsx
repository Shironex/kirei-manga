import { PageHeader } from '../components/layout/PageHeader';

const SECTIONS = [
  {
    kanji: '色',
    eyebrow: 'Appearance',
    title: 'Theme & typography',
    body: 'Switch between sumi (dark) and washi (light). Adjust reader font and line spacing.',
  },
  {
    kanji: '読',
    eyebrow: 'Reader',
    title: 'Reading defaults',
    body: 'Page fit, direction (RTL / LTR), double-page spread, keyboard shortcuts.',
  },
  {
    kanji: '架',
    eyebrow: 'Library',
    title: 'Local folders & cache',
    body: 'Point KireiManga at your CBZ collection. Manage chapter cache and translation storage.',
  },
  {
    kanji: '訳',
    eyebrow: 'Translation',
    title: 'OCR & providers',
    body: 'DeepL, Google, or local Ollama. Target language, cache policy, overlay style.',
  },
];

export function SettingsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Settings"
        kanji="設定"
        title="Everything, tuned to you."
        subtitle="KireiManga is local-first. Your library, keys, and translation cache never leave this machine unless you ask."
      />

      <div className="animate-fade-up grid grid-cols-1 gap-x-10 gap-y-px md:grid-cols-2">
        {SECTIONS.map((section) => (
          <button
            key={section.eyebrow}
            type="button"
            className="group relative flex items-start gap-5 border-t border-border py-6 pr-6 text-left transition-colors hover:bg-[var(--color-ink-raised)]"
          >
            <span
              aria-hidden
              className="font-kanji flex h-9 w-9 shrink-0 items-center justify-center text-[20px] leading-none text-[var(--color-bone-faint)] transition-colors group-hover:text-[var(--color-accent)]"
            >
              {section.kanji}
            </span>
            <div className="flex-1">
              <span className="font-mono block text-[10px] tracking-[0.24em] text-[var(--color-bone-faint)] uppercase">
                {section.eyebrow}
              </span>
              <h3 className="font-display mt-1.5 text-[18px] leading-tight font-[380] tracking-[-0.008em] text-foreground">
                {section.title}
              </h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                {section.body}
              </p>
            </div>
            <span
              aria-hidden
              className="mt-2 font-mono text-[11px] text-[var(--color-bone-faint)] transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)]"
            >
              →
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
