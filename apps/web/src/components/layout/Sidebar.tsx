import { NavLink } from 'react-router-dom';
import { BookOpen, Compass, Settings2 } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { useT } from '@/hooks/useT';

type NavItem = {
  to: string;
  labelKey: string;
  kanji: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  end?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { to: '/', labelKey: 'nav.library', kanji: '書', icon: BookOpen, end: true },
  { to: '/browse', labelKey: 'nav.browse', kanji: '探', icon: Compass },
  { to: '/settings', labelKey: 'nav.settings', kanji: '設', icon: Settings2 },
];

export function Sidebar() {
  const t = useT();
  return (
    <aside className="relative flex w-[232px] shrink-0 flex-col bg-[var(--color-ink-sunken)]">
      {/* Tategaki rail — vertical wordmark */}
      <div className="pointer-events-none absolute top-10 left-7 flex flex-col items-center gap-2 text-[var(--color-bone-faint)] select-none">
        <span className="font-kanji text-[28px] leading-none tracking-[0.2em] [writing-mode:vertical-rl]">
          綺麗
        </span>
        <span className="mt-2 block h-12 w-px bg-[var(--color-rule)]" />
      </div>

      <div className="flex flex-1 flex-col pt-[140px]">
        <nav className="flex flex-col gap-px px-4">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  'group relative flex items-center gap-3 rounded-sm py-2 pr-3 pl-5 text-[13px] transition-colors duration-200',
                  isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    aria-hidden
                    className={[
                      'absolute top-1/2 left-0 h-5 w-px -translate-y-1/2 transition-all duration-300',
                      isActive
                        ? 'bg-[var(--color-accent)] opacity-100'
                        : 'bg-[var(--color-rule-strong)] opacity-0 group-hover:opacity-60',
                    ].join(' ')}
                  />
                  <span
                    className={[
                      'font-kanji w-4 text-center text-[13px] leading-none transition-colors',
                      isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-bone-faint)]',
                    ].join(' ')}
                    aria-hidden
                  >
                    {item.kanji}
                  </span>
                  <span className="flex-1 tracking-wide">{t(item.labelKey)}</span>
                  <item.icon
                    className={[
                      'h-3.5 w-3.5 stroke-[1.25] transition-opacity',
                      isActive ? 'opacity-70' : 'opacity-0 group-hover:opacity-40',
                    ].join(' ')}
                  />
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto px-6 pb-6">
          <div className="mb-3 h-px w-6 bg-[var(--color-rule-strong)]" />
          <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--color-bone-faint)] uppercase">
            {t('nav.footer')}
          </p>
        </div>
      </div>

      {/* Right-edge hairline */}
      <span aria-hidden className="absolute top-0 right-0 h-full w-px bg-[var(--color-border)]" />
    </aside>
  );
}
