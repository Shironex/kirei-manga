import { useState } from 'react';
import { CircleCheck, FolderOpen, LoaderCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/chip';
import { formatBytes } from '@/lib/reader';
import { openDataDir } from '@/lib/settings/commands';
import { fileName } from '@/lib/settings/data';

import {
  CreateBackupDialog,
  formatBackupDate,
  Problem,
  RestoreBackupDialog,
} from './BackupDialogs';
import { plural } from './format';
import { SettingRow, SettingsList, SettingsSection } from './SettingRow';
import { useBackup, type BackupControls } from './useBackup';

const MODE_HELP = {
  portable: 'Portable mode: the folder sits next to the app, so the whole folder can move.',
  installed: 'Installed mode: kept in your user profile.',
} as const;

/** `backups/pre-restore-...` when `path` is inside the data folder, else `path`. */
function insideData(path: string, root: string | undefined): string {
  if (!root || !path.startsWith(root)) return path;
  return path.slice(root.length).replace(/^[\\/]+/, '');
}

function DataFolderHelp({ backup }: { backup: BackupControls }) {
  const { info } = backup;
  if (!info) return <>Where KireiManga keeps its files.</>;
  return (
    <>
      <code className="block font-mono text-[13px] wrap-anywhere text-fg-2">{info.root}</code>
      <span className="mt-1 block">{MODE_HELP[info.mode]}</span>
    </>
  );
}

/** The Backup row's help: what happened last, else what a backup is. */
function BackupHelp({ backup }: { backup: BackupControls }) {
  const { info, saved, restore } = backup;
  if (restore.step === 'inspecting') {
    return (
      <span className="flex items-center gap-2">
        <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
        Checking {fileName(restore.path)}
      </span>
    );
  }
  if (saved) {
    const covers = saved.manifest.includesCovers
      ? `, ${plural(saved.manifest.coverCount, 'cover')}`
      : '';
    return (
      <span className="flex items-start gap-2 text-fg-2">
        <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-ok" />
        <span className="min-w-0">
          Saved <span className="font-mono text-[13px] wrap-anywhere">{fileName(saved.path)}</span>{' '}
          ({formatBytes(saved.manifest.databaseBytes)} of library data{covers}).
        </span>
      </span>
    );
  }
  if (info?.restoreError) {
    return (
      <Problem
        inline
        problem={{
          summary: 'The last restore did not finish, so your data was left as it was.',
          detail: info.restoreError,
        }}
      />
    );
  }
  if (info?.lastRestore) {
    return (
      <span className="flex items-start gap-2 text-fg-2">
        <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-ok" />
        <span className="min-w-0">
          Restored the backup from {formatBackupDate(info.lastRestore.manifest.createdAt)}. The data
          it replaced is kept in{' '}
          <code className="font-mono text-[13px] whitespace-nowrap">
            {insideData(info.lastRestore.previousData, info.root)}
          </code>{' '}
          in the data folder.
        </span>
      </span>
    );
  }
  return <>Library, progress and settings in one file.</>;
}

export function DataSection() {
  const backup = useBackup();
  const [openError, setOpenError] = useState<string | null>(null);
  const { info, available, restore } = backup;

  const open = () => {
    setOpenError(null);
    openDataDir().catch((e: unknown) => setOpenError(String(e)));
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
          label={
            <span className="flex items-center gap-2">
              Data folder
              {info?.mode === 'portable' && <Tag className="h-[22px]">Portable</Tag>}
            </span>
          }
          help={<DataFolderHelp backup={backup} />}
          error={openError ?? backup.infoError}
          control={
            <Button
              variant="ghost"
              size="sm"
              disabled={!available}
              aria-describedby="data-dir-label"
              onClick={open}
            >
              <FolderOpen /> Open
            </Button>
          }
        />
        <SettingRow
          id="backup"
          labelFor={false}
          label="Backup"
          help={<BackupHelp backup={backup} />}
          control={
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={!available || restore.step !== 'closed'}
                aria-describedby="backup-label"
                onClick={() => void backup.pickRestore()}
              >
                Restore
              </Button>
              <Button
                size="sm"
                disabled={!available}
                aria-describedby="backup-label"
                onClick={backup.openCreate}
              >
                Create backup
              </Button>
            </>
          }
        />
      </SettingsList>
      <CreateBackupDialog backup={backup} />
      <RestoreBackupDialog backup={backup} />
    </SettingsSection>
  );
}
