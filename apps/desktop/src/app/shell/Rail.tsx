import type { ComponentType, SVGProps } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { ArrowDownToLine, Compass, Gauge, LibraryBig, Settings2, SwatchBook } from 'lucide-react';

import kireiFace from '@/assets/kirei/face.webp';
import { cn } from '@/lib/utils';

import { ariaShortcut, type NavPath } from './useShortcuts';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const NAV: { to: NavPath; label: string; icon: Icon; also?: string }[] = [
  // A series page is part of the library, so the rail keeps Library lit there.
  { to: '/library', label: 'Library', icon: LibraryBig, also: '/series/' },
  { to: '/browse', label: 'Browse', icon: Compass },
  { to: '/downloads', label: 'Downloads', icon: ArrowDownToLine },
  { to: '/settings', label: 'Settings', icon: Settings2 },
];

const DEV_NAV: { to: '/dev/design' | '/dev/engine'; label: string; icon: Icon }[] = [
  { to: '/dev/design', label: 'Design system', icon: SwatchBook },
  { to: '/dev/engine', label: 'Engine bench', icon: Gauge },
];

const itemClass = cn(
  'flex items-center gap-3 rounded-[10px] px-3 py-[9px] font-medium text-fg-2 no-underline',
  'transition-[background-color,color] duration-base ease-expo hover:bg-ink-2 hover:text-fg-1',
  'aria-[current=page]:bg-accent-wash aria-[current=page]:text-fg-1 [&[aria-current=page]_svg]:text-accent'
);

export function Rail() {
  const pathname = useRouterState({ select: s => s.location.pathname });
  return (
    <aside
      data-shell-rail
      className="relative flex min-h-0 flex-col gap-6 border-r border-line bg-ink-1 px-4 pt-6 pb-4 [:root[data-chrome=overlay]_&]:pt-[52px]"
    >
      {/* macOS overlay title bar: the strip above the brand drags the window. */}
      <div
        data-tauri-drag-region
        aria-hidden
        className="absolute inset-x-0 top-0 hidden h-[44px] [:root[data-chrome=overlay]_&]:block"
      />
      <Link
        to="/library"
        aria-label="KireiManga, go to the library"
        className="flex items-baseline gap-2.5 rounded-lg px-2 py-1 -my-1 text-fg-1 no-underline"
      >
        <span lang="ja" className="text-xl tracking-[0.04em]">
          綺麗漫画
        </span>
        <small className="font-display text-sm font-semibold text-fg-3 [font-variation-settings:'wdth'_85]">
          KireiManga
        </small>
      </Link>

      <nav aria-label="Main" className="grid gap-0.5">
        {NAV.map(({ to, label, icon: Icon, also }) => (
          <Link
            key={to}
            to={to}
            aria-keyshortcuts={ariaShortcut(to)}
            aria-current={also && pathname.startsWith(also) ? 'page' : undefined}
            className={itemClass}
          >
            <Icon aria-hidden />
            <span>{label}</span>
          </Link>
        ))}
        {import.meta.env.DEV && (
          <>
            <p className="m-0 mt-3 mb-0.5 px-3 text-xs text-fg-3">Development</p>
            {DEV_NAV.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} className={itemClass}>
                <Icon aria-hidden />
                <span>{label}</span>
              </Link>
            ))}
          </>
        )}
      </nav>

      <div className="mt-auto flex items-center gap-3 rounded-panel bg-ink-2 p-3">
        <img
          src={kireiFace}
          alt="Kirei"
          draggable={false}
          className="size-10 shrink-0 rounded-full bg-ink-3 object-cover object-[50%_30%] shadow-[inset_0_0_0_1px_var(--line-strong)]"
        />
        <p className="m-0 text-xs leading-[1.4] text-fg-2">
          <b className="font-semibold text-fg-1">Kirei</b>
          <br />
          Add a folder and I will find your manga.
        </p>
      </div>
    </aside>
  );
}
