import { NavLink } from 'react-router-dom';
import { BookOpen, Compass, PanelLeftClose, PanelLeftOpen, Settings2 } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { useT } from '@/hooks/useT';
import { useUIStore } from '@/stores/ui-store';
import { Tooltip } from '@/components/ui/Tooltip';

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

const COLLAPSED_SIDEBAR_WIDTH = 56;
const COLLAPSED_NAV_ITEM_SIZE = 36;

export function Sidebar() {
  const t = useT();
  const collapsed = useUIStore(s => s.sidebarCollapsed);
  const toggle = useUIStore(s => s.toggleSidebar);

  return (
    <aside
      style={{ width: collapsed ? COLLAPSED_SIDEBAR_WIDTH : 232 }}
      className="relative flex shrink-0 flex-col bg-[var(--color-ink-sunken)] transition-[width] duration-200 ease-[var(--ease-out-quart)]"
    >
      {!collapsed && (
        <div className="pointer-events-none absolute top-10 left-7 flex flex-col items-center gap-2 text-[var(--color-bone-faint)] select-none">
          <span className="font-kanji text-[28px] leading-none tracking-[0.2em] [writing-mode:vertical-rl]">
            綺麗
          </span>
          <span className="mt-2 block h-12 w-px bg-[var(--color-rule)]" />
        </div>
      )}

      <div className={['flex flex-1 flex-col', collapsed ? 'pt-5' : 'pt-[140px]'].join(' ')}>
        <nav className={['flex w-full flex-col gap-px', collapsed ? '' : 'px-4'].join(' ')}>
          {NAV_ITEMS.map(item => {
            const link = (
              <NavLink
                to={item.to}
                end={item.end}
                style={
                  collapsed
                    ? { width: COLLAPSED_NAV_ITEM_SIZE, height: COLLAPSED_NAV_ITEM_SIZE }
                    : undefined
                }
                className={({ isActive }) =>
                  [
                    'group relative rounded-sm text-[13px] transition-colors duration-200',
                    collapsed ? 'grid place-items-center' : 'flex w-full items-center gap-3 py-2 pr-3 pl-5',
                    isActive
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    {!collapsed && (
                      <span
                        aria-hidden
                        className={[
                          'absolute top-1/2 left-0 h-5 w-px -translate-y-1/2 transition-all duration-300',
                          isActive
                            ? 'bg-[var(--color-accent)] opacity-100'
                            : 'bg-[var(--color-rule-strong)] opacity-0 group-hover:opacity-60',
                        ].join(' ')}
                      />
                    )}
                    <span
                      className={[
                        'font-kanji leading-none transition-colors',
                        collapsed
                          ? 'flex h-full w-full items-center justify-center text-center text-[15px]'
                          : 'w-4 text-center text-[13px]',
                        isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-bone-faint)]',
                      ].join(' ')}
                      aria-hidden
                    >
                      {item.kanji}
                    </span>
                    {!collapsed && (
                      <>
                        <span className="flex-1 tracking-wide">{t(item.labelKey)}</span>
                        <item.icon
                          className={[
                            'h-3.5 w-3.5 stroke-[1.25] transition-opacity',
                            isActive ? 'opacity-70' : 'opacity-0 group-hover:opacity-40',
                          ].join(' ')}
                        />
                      </>
                    )}
                  </>
                )}
              </NavLink>
            );
            return (
              <div
                key={item.to}
                className={[
                  'flex w-full',
                  collapsed ? 'justify-center' : '',
                ].join(' ')}
              >
                {collapsed ? (
                  <Tooltip content={t(item.labelKey)} side="right">
                    {link}
                  </Tooltip>
                ) : (
                  link
                )}
              </div>
            );
          })}
        </nav>

        <div
          className={[
            'mt-auto',
            collapsed
              ? 'flex flex-col items-center gap-3 pb-5'
              : 'flex items-center justify-between px-6 pb-6',
          ].join(' ')}
        >
          {collapsed ? (
            <>
              <p className="font-mono text-[9px] tracking-[0.14em] text-[var(--color-bone-faint)] uppercase">
                {t('nav.footer')}
              </p>
              <Tooltip content={t('nav.sidebar.expand')} side="right">
                <button
                  type="button"
                  onClick={toggle}
                  aria-label={t('nav.sidebar.expand')}
                  className="text-[var(--color-bone-faint)] transition-colors hover:text-foreground"
                >
                  <PanelLeftOpen className="h-4 w-4 stroke-[1.4]" />
                </button>
              </Tooltip>
            </>
          ) : (
            <>
              <div className="flex flex-col">
                <div className="mb-3 h-px w-6 bg-[var(--color-rule-strong)]" />
                <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--color-bone-faint)] uppercase">
                  {t('nav.footer')}
                </p>
              </div>
              <Tooltip content={t('nav.sidebar.collapse')} side="right">
                <button
                  type="button"
                  onClick={toggle}
                  aria-label={t('nav.sidebar.collapse')}
                  className="text-[var(--color-bone-faint)] transition-colors hover:text-foreground"
                >
                  <PanelLeftClose className="h-4 w-4 stroke-[1.4]" />
                </button>
              </Tooltip>
            </>
          )}
        </div>
      </div>

      <span aria-hidden className="absolute top-0 right-0 h-full w-px bg-[var(--color-border)]" />
    </aside>
  );
}
