import { Search } from 'lucide-react';

export function TopBar() {
  return (
    <header className="app-drag relative flex h-12 shrink-0 items-center gap-6 border-b border-border bg-background pr-4 pl-6">
      <div className="flex items-center gap-2.5">
        <span
          className="font-kanji text-[15px] leading-none text-[var(--color-accent)]"
          aria-hidden
        >
          綺
        </span>
        <span className="font-display text-[13px] font-medium tracking-[0.02em] text-foreground">
          KireiManga
        </span>
        <span
          className="ml-2 font-mono text-[10px] tracking-[0.22em] text-[var(--color-bone-faint)] uppercase"
          aria-hidden
        >
          綺麗漫画
        </span>
      </div>

      <div className="app-no-drag ml-auto flex items-center gap-4">
        <label className="group flex h-8 w-[280px] items-center gap-2 rounded-sm border border-border bg-[var(--color-ink-sunken)] px-2.5 transition-colors focus-within:border-[var(--color-accent)]">
          <Search className="h-3.5 w-3.5 stroke-[1.4] text-[var(--color-bone-faint)] transition-colors group-focus-within:text-[var(--color-accent)]" />
          <input
            type="search"
            placeholder="Search library or MangaDex…"
            className="flex-1 bg-transparent text-[12px] tracking-wide text-foreground placeholder:text-[var(--color-bone-faint)] focus:outline-none"
          />
          <kbd className="font-mono text-[9px] tracking-wider text-[var(--color-bone-faint)]">
            ⌘K
          </kbd>
        </label>

        {/* Reserved slot for future window controls (frameless Electron). */}
        <span aria-hidden className="h-4 w-px bg-[var(--color-border)]" />
        <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-bone-faint)] uppercase">
          Offline
        </span>
      </div>
    </header>
  );
}
