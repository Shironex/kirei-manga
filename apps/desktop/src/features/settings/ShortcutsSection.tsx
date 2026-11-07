import { Kbd } from '@/components/ui/tooltip';
import { modKeyLabel } from '@/app/shell/platform';
import { NAV_SHORTCUTS, type NavPath } from '@/app/shell/useShortcuts';

import { SettingsList, SettingsSection } from './SettingRow';

const NAV_LABELS: Record<NavPath, string> = {
  '/library': 'Go to the library',
  '/browse': 'Go to browse',
  '/downloads': 'Go to downloads',
  '/settings': 'Open settings',
};

/** Keyboard reference, built from the same table the shortcuts run on. */
export function ShortcutsSection() {
  const mod = modKeyLabel();
  const rows: { action: string; keys: string[] }[] = [
    ...(Object.entries(NAV_SHORTCUTS) as [NavPath, string][]).map(([path, key]) => ({
      action: NAV_LABELS[path],
      keys: [mod, key],
    })),
    { action: 'Leave the reader', keys: ['Esc'] },
  ];

  return (
    <SettingsSection
      id="shortcuts"
      title="Keyboard shortcuts"
      lead="Reader keys for turning pages and switching modes arrive with the reader."
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
    </SettingsSection>
  );
}
