import { useState, type ReactNode } from 'react';
import { getRouteApi } from '@tanstack/react-router';

import kireiFull from '@/assets/kirei/full.webp';
import { PageHeader } from '@/components/page/PageHeader';
import { Segmented, SegmentedItem } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';
import { describeAppInfo, getAppInfo, isTauri, type AppInfo } from '@/lib/ipc';
import {
  readPreferences,
  setAmbient,
  setGlass,
  setStrength,
  type Strength,
} from '@/lib/theme/seed';
import { cn } from '@/lib/utils';

/** Route loader: the About section shows the build the Rust core reports. */
export async function loadAbout(): Promise<{ info: AppInfo | null }> {
  return { info: isTauri() ? await getAppInfo() : null };
}

const route = getRouteApi('/shell/settings');

const SECTIONS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'about', label: 'About' },
] as const;

function Item({
  id,
  label,
  help,
  control,
}: {
  id: string;
  label: string;
  help?: string;
  control: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 px-6 py-4 [&+&]:border-t [&+&]:border-line">
      <div>
        <label htmlFor={id} id={`${id}-label`} className="block font-medium">
          {label}
        </label>
        {help && <p className="m-0 mt-0.5 text-sm text-fg-3">{help}</p>}
      </div>
      {control}
    </div>
  );
}

export function SettingsPage() {
  const { info } = route.useLoaderData();
  const [prefs, setPrefs] = useState(readPreferences);
  const [section, setSection] = useState<string>('appearance');

  const jump = (id: string) => {
    setSection(id);
    document.getElementById(`settings-${id}`)?.scrollIntoView({ block: 'start' });
  };

  return (
    <>
      <PageHeader
        title="Settings"
        lead="Everything is stored in one SQLite file next to your library, or next to the app in portable mode."
      />
      <div className="grid grid-cols-[200px_minmax(0,720px)] items-start gap-12">
        <nav aria-label="Settings sections" className="sticky top-6 grid gap-0.5">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              type="button"
              aria-current={section === s.id ? 'true' : undefined}
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

        <div>
          <section id="settings-appearance" className="mb-12 scroll-mt-6">
            <h2 className="m-0 mb-2 font-display text-2xl font-[650] font-condensed">Appearance</h2>
            <p className="m-0 mb-4 max-w-[60ch] text-sm text-fg-3">
              The interface takes its colour from the cover you are looking at. These apply at once
              and reset on restart until settings are saved to the library database.
            </p>
            <div className="rounded-panel border border-line bg-ink-1">
              <Item
                id="pref-strength"
                label="Strength"
                help="How much colour the cover is allowed to bring in."
                control={
                  <Segmented
                    id="pref-strength"
                    aria-labelledby="pref-strength-label"
                    value={prefs.strength}
                    onValueChange={v => {
                      setStrength(v as Strength);
                      setPrefs(p => ({ ...p, strength: v as Strength }));
                    }}
                  >
                    <SegmentedItem value="subtle">Subtle</SegmentedItem>
                    <SegmentedItem value="balanced">Balanced</SegmentedItem>
                    <SegmentedItem value="vivid">Vivid</SegmentedItem>
                  </Segmented>
                }
              />
              <Item
                id="pref-ambient"
                label="Ambient backdrop"
                help="A soft glow of the cover colour behind the page header."
                control={
                  <Switch
                    id="pref-ambient"
                    checked={prefs.ambient}
                    onCheckedChange={on => {
                      setAmbient(on);
                      setPrefs(p => ({ ...p, ambient: on }));
                    }}
                  />
                }
              />
              <Item
                id="pref-glass"
                label="Glass panels"
                help="Frosted reader toolbars. Off uses solid surfaces."
                control={
                  <Switch
                    id="pref-glass"
                    checked={prefs.glass}
                    onCheckedChange={on => {
                      setGlass(on);
                      setPrefs(p => ({ ...p, glass: on }));
                    }}
                  />
                }
              />
            </div>
          </section>

          <section id="settings-about" className="mb-12 scroll-mt-6">
            <h2 className="m-0 mb-4 font-display text-2xl font-[650] font-condensed">About</h2>
            <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-8 rounded-panel border border-line bg-ink-1 p-6">
              <img src={kireiFull} alt="" draggable={false} className="w-[120px]" />
              <div>
                <p lang="ja" className="m-0 text-2xl tracking-[0.06em]">
                  綺麗漫画
                </p>
                <p className="m-0 mt-1.5 text-sm text-fg-2">
                  {info ? describeAppInfo(info) : 'KireiManga, running in a browser preview.'}
                </p>
                <p className="m-0 mt-1.5 text-sm text-fg-3">
                  A local-first manga reader for Windows and macOS.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
