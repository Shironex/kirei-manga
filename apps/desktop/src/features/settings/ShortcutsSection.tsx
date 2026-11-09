import { Kbd } from '@/components/ui/tooltip';
import { modKeyLabel } from '@/app/shell/platform';
import { NAV_SHORTCUTS, type NavPath } from '@/app/shell/useShortcuts';

import { paletteShortcutKeys } from '@/features/palette/shortcut';

import { ReaderKeysEditor } from './ReaderKeysEditor';
import { SettingsList, SettingsSection } from './SettingRow';

const NAV_LABELS: Record<NavPath, string> = {
  '/library': 'Go to the library',
  '/browse': 'Go to browse',
  '/downloads': 'Go to downloads',
  '/stats': 'Go to reading stats',
  '/collections': 'Go to collections',
  '/settings': 'Open settings',
};

/**
 * App shortcuts (fixed, built from the table they run on) and the reader's
 * keys, which can be changed.
 */
export function ShortcutsSection() {
  const mod = modKeyLabel();
  const rows: { action: string; keys: string[] }[] = [
    ...(Object.entries(NAV_SHORTCUTS) as [NavPath, string][]).map(([path, key]) => ({
      action: NAV_LABELS[path],
      keys: [mod, key],
    })),
    { action: 'Open the command palette', keys: paletteShortcutKeys() },
  ];

  return (
    <SettingsSection
      id="shortcuts"
      title="Keyboard shortcuts"
      lead="App shortcuts use the command key and stay fixed. Reader keys are yours to change: add a key by pressing it, and a key another command uses is only moved when you say so."
    >
      <SettingsList>
        <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto]">
          {rows.map(row => (
            <div
              key={row.action}
              className="col-span-2 grid grid-cols-subgrid items-center px-6 py-3 [&+&]:border-t [&+&]:border-line"
            >
              <dt className="text-fg-2">{row.action}</dt>
              <dd className="m-0 flex gap-1">
                {row.keys.map(key => (
                  <Kbd key={key} className="h-6 min-w-6 px-1.5 text-xs">
                    {key}
                  </Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </SettingsList>
      <h3 id="reader-keys-title" className="m-0 mt-6 mb-3 font-medium">
        In the reader
      </h3>
      <SettingsList>
        <ReaderKeysEditor />
      </SettingsList>
    </SettingsSection>
  );
}
