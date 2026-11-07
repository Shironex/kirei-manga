import { useEffect, useState } from 'react';
import { FolderOpen } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { isTauri } from '@/lib/ipc';
import { getDataDir, openDataDir } from '@/lib/settings/commands';

import { SettingRow, SettingsList, SettingsSection } from './SettingRow';

export function DataSection() {
  const [dir, setDir] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    let live = true;
    getDataDir().then(
      path => live && setDir(path),
      (e: unknown) => live && setError(String(e))
    );
    return () => {
      live = false;
    };
  }, []);

  const open = () => {
    setError(null);
    openDataDir().catch((e: unknown) => setError(String(e)));
  };

  return (
    <SettingsSection
      id="data"
      title="Data"
      lead="The library database, your settings and the cover cache live in one folder."
    >
      <SettingsList>
        <SettingRow
          id="data-dir"
          labelFor={false}
          label="Data folder"
          help={
            dir ? (
              <code className="font-mono text-[13px] break-all text-fg-2">{dir}</code>
            ) : (
              'Where KireiManga keeps its files.'
            )
          }
          error={error}
          control={
            <Button
              variant="ghost"
              size="sm"
              disabled={!isTauri()}
              aria-describedby="data-dir-label"
              onClick={open}
            >
              <FolderOpen /> Open
            </Button>
          }
        />
        {/* Backup and restore land with #34 (portable mode and backup). */}
        <SettingRow
          id="backup"
          labelFor={false}
          label="Backup"
          help="Library, progress and settings in one file. Coming soon."
          control={
            <>
              <Button variant="ghost" size="sm" disabled aria-describedby="backup-help">
                Restore
              </Button>
              <Button size="sm" disabled aria-describedby="backup-help">
                Create backup
              </Button>
            </>
          }
        />
      </SettingsList>
    </SettingsSection>
  );
}
