import { useEffect, useState } from 'react';
import { getRouteApi } from '@tanstack/react-router';

import { PageHeader } from '@/components/page/PageHeader';
import { useSettings } from '@/lib/settings/store';
import { cn } from '@/lib/utils';

import { AboutSection } from './AboutSection';
import { AccountsSection } from './AccountsSection';
import { AppearanceSection } from './AppearanceSection';
import { DataSection } from './DataSection';
import { DownloadsSection } from './DownloadsSection';
import { LibrarySection } from './LibrarySection';
import { ReaderSection } from './ReaderSection';
import { ShortcutsSection } from './ShortcutsSection';

const route = getRouteApi('/shell/settings');

const SECTIONS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'reader', label: 'Reader' },
  { id: 'library', label: 'Library' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'data', label: 'Data' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'about', label: 'About' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

/** The last section whose heading has reached the top of the scroll area, for the nav highlight. */
function useActiveSection(initial: SectionId): [SectionId, (id: SectionId) => void] {
  const [active, setActive] = useState<SectionId>(initial);
  useEffect(() => {
    const scroller = document.getElementById('main');
    if (!scroller) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = scroller.getBoundingClientRect().top + 120;
      let current: SectionId = initial;
      for (const el of scroller.querySelectorAll<HTMLElement>('[data-settings-section]')) {
        if (el.getBoundingClientRect().top <= line) {
          current = el.dataset.settingsSection as SectionId;
        }
      }
      // At the very bottom the last section wins even if its heading cannot reach the line.
      if (
        scroller.scrollTop > 0 &&
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2
      ) {
        current = 'about';
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [initial]);
  return [active, setActive];
}

export function SettingsPage() {
  const { info } = route.useLoaderData();
  const { error } = useSettings();
  const [active, setActive] = useActiveSection('appearance');

  const jump = (id: SectionId) => {
    setActive(id);
    const section = document.getElementById(`settings-${id}`);
    section?.scrollIntoView({ block: 'start' });
    section?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  };

  return (
    <>
      <PageHeader
        title="Settings"
        lead="Everything is stored in one SQLite file next to your library and applies at once."
      />
      {error && (
        <p role="alert" className="m-0 mb-6 max-w-[720px] text-sm text-err">
          Settings could not be loaded, so the defaults are in use and changes last until restart.{' '}
          {error}
        </p>
      )}
      <div className="grid grid-cols-[200px_minmax(0,720px)] items-start gap-12">
        <nav aria-label="Settings sections" className="sticky top-6 grid gap-0.5">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              type="button"
              aria-current={active === s.id ? 'true' : undefined}
              onClick={() => jump(s.id)}
              className={cn(
                'rounded-lg px-3 py-2 text-left text-sm text-fg-2 transition-colors duration-base hover:bg-ink-2 hover:text-fg-1',
                'aria-[current=true]:bg-ink-2 aria-[current=true]:text-fg-1'
              )}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="[&_h2]:outline-none">
          <AppearanceSection />
          <ReaderSection />
          <LibrarySection />
          <DownloadsSection />
          <AccountsSection />
          <DataSection />
          <ShortcutsSection />
          <AboutSection info={info} />
        </div>
      </div>
    </>
  );
}
