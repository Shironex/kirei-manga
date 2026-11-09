import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpen } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Segmented, SegmentedItem } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';
import { refreshDownloadFolder, useDownloads } from '@/features/downloads/downloadsStore';
import { useSetting } from '@/lib/settings/store';

import { SettingRow, SettingsList, SettingsSection, useSettingControl } from './SettingRow';

const CONCURRENCY = [1, 2, 3, 4] as const;

/** The folder row: where downloads go, with a picker and a way back to the default. */
function FolderRow() {
  const [folder, setFolder] = useSetting('downloads.folder');
  const { folder: status } = useDownloads();
  const [error, setError] = useState<string | null>(null);

  const change = async (next: string | null) => {
    setError(null);
    try {
      await setFolder(next);
      await refreshDownloadFolder();
    } catch (reason) {
      setError(`Not saved: ${reason instanceof Error ? reason.message : String(reason)}`);
    }
  };

  const pick = async () => {
    const picked = await open({ directory: true, multiple: false, title: 'Downloads folder' });
    if (typeof picked === 'string') await change(picked);
  };

  const shown = status?.path || folder;
  const outside = status && status.path && !status.inLibrary;

  return (
    <SettingRow
      id="pref-downloads-folder"
      labelFor={false}
      label="Folder"
      help={
        <>
          {shown ? (
            <code className="block truncate font-mono text-[13px] text-fg-2" title={shown}>
              {shown}
            </code>
          ) : (
            'A downloads folder in the data folder.'
          )}
          <span className="block">
            Added to your library as a folder of its own. Inside an existing library folder works
            too.
          </span>
          {outside && (
            <span className="block text-err">
              Not in your library{status.error ? `: ${status.error}` : ''}.
            </span>
          )}
        </>
      }
      error={error}
      control={
        <>
          {folder !== null && (
            <Button variant="quiet" size="sm" onClick={() => void change(null)}>
              Use default
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => void pick()}>
            <FolderOpen /> Change
          </Button>
        </>
      }
    />
  );
}

export function DownloadsSection() {
  const [dataSaver, setDataSaver, dataSaverError] = useSettingControl('downloads.dataSaver');
  const [concurrency, setConcurrency, concurrencyError] =
    useSettingControl('downloads.concurrency');
  const [autoFollows, setAutoFollows, autoFollowsError] =
    useSettingControl('downloads.autoFollows');

  return (
    <SettingsSection
      id="downloads"
      title="Downloads"
      lead="Chapters from MangaDex are saved as CBZ archives with ComicInfo.xml and read offline like any other file."
    >
      <SettingsList>
        <FolderRow />
        <SettingRow
          id="pref-data-saver"
          label="Data saver"
          help="Download MangaDex's smaller, recompressed pages. Applies to chapters queued from now on."
          error={dataSaverError}
          control={
            <Switch
              id="pref-data-saver"
              aria-describedby="pref-data-saver-help"
              checked={dataSaver}
              onCheckedChange={setDataSaver}
            />
          }
        />
        <SettingRow
          id="pref-concurrency"
          labelFor={false}
          label="Chapters at a time"
          help="Every download shares MangaDex's rate limits, so more chapters at once never goes faster than MangaDex allows."
          error={concurrencyError}
          control={
            <Segmented
              aria-labelledby="pref-concurrency-label"
              value={String(concurrency)}
              onValueChange={v => setConcurrency(Number(v))}
            >
              {CONCURRENCY.map(n => (
                <SegmentedItem key={n} value={String(n)}>
                  {n}
                </SegmentedItem>
              ))}
            </Segmented>
          }
        />
        <SettingRow
          id="pref-auto-follows"
          label="Download new chapters of followed series"
          help="New chapters in your MangaDex follow feed are queued as they appear."
          error={autoFollowsError}
          control={
            <Switch
              id="pref-auto-follows"
              aria-describedby="pref-auto-follows-help"
              checked={autoFollows}
              onCheckedChange={setAutoFollows}
            />
          }
        />
      </SettingsList>
    </SettingsSection>
  );
}
