import { Folder, FolderPlus, RefreshCw, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { LibraryRoot, ScanProgress } from '@/lib/library';
import { formatBytes } from '@/lib/reader';

import { ConfirmButton } from './ConfirmButton';
import { formatAgo, plural } from './format';
import { SettingRow, SettingsList, SettingsSection } from './SettingRow';
import { useLibraryMaintenance, type ScanTarget } from './useLibraryMaintenance';

const PHASE_LABEL: Record<ScanProgress['phase'], string> = {
  discovering: 'Looking for archives',
  reading: 'Reading archives',
  covers: 'Making covers',
  saving: 'Saving',
  done: 'Done',
};

function describeScan(progress: ScanProgress | null): string {
  if (!progress) return 'Scanning…';
  const count = progress.total > 1 ? ` ${progress.done} of ${progress.total}` : '';
  return `${PHASE_LABEL[progress.phase]}${count}`;
}

function describeRoot(root: LibraryRoot): string {
  const scanned = root.lastScanAt ? `last scan ${formatAgo(root.lastScanAt)}` : 'not scanned yet';
  return `${plural(root.seriesCount, 'series', 'series')}, ${scanned}`;
}

function isScanning(scanning: ScanTarget | null, root: LibraryRoot): boolean {
  return scanning === 'all' || scanning === root.id;
}

export function LibrarySection() {
  const library = useLibraryMaintenance();
  const { roots, cache, scanning, progress, busy } = library;

  return (
    <SettingsSection
      id="library"
      title="Library folders"
      lead="Files are read in place and never extracted to disk. Removing a folder keeps its reading progress, hidden, until you clean it up below."
    >
      <SettingsList>
        {roots?.map(root => (
          <SettingRow
            key={root.id}
            id={`root-${root.id}`}
            labelFor={false}
            label={
              <span className="flex min-w-0 items-center gap-3">
                <Folder aria-hidden className="size-[18px] shrink-0 text-fg-3" />
                <code className="truncate font-mono text-[13px] text-fg-2" title={root.path}>
                  {root.path}
                </code>
              </span>
            }
            help={
              <span className="tabular ml-[30px] block" aria-live="polite">
                {isScanning(scanning, root) ? describeScan(progress) : describeRoot(root)}
              </span>
            }
            control={
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  aria-describedby={`root-${root.id}-label`}
                  onClick={() => void library.scan(root.id)}
                >
                  <RefreshCw className={isScanning(scanning, root) ? 'animate-spin' : undefined} />
                  Rescan
                </Button>
                <ConfirmButton
                  variant="quiet"
                  size="icon-sm"
                  aria-label={`Remove ${root.path}`}
                  disabled={busy}
                  title="Remove this folder?"
                  description={
                    <>
                      <code className="font-mono text-[13px] break-all">{root.path}</code> leaves
                      the library. Files on disk are not touched, and reading progress is kept
                      hidden in case you add the folder again.
                    </>
                  }
                  confirmLabel="Remove folder"
                  onConfirm={() => void library.removeFolder(root)}
                >
                  <Trash2 />
                </ConfirmButton>
              </>
            }
          />
        ))}
        <SettingRow
          id="root-add"
          labelFor={false}
          label="Add a folder"
          help="CBZ, CBR, ZIP and plain image folders. Each folder inside it becomes a series."
          control={
            <Button
              size="sm"
              disabled={!library.available || busy}
              onClick={() => void library.addFolder()}
            >
              <FolderPlus /> Add folder
            </Button>
          }
        />
      </SettingsList>

      <SettingsList className="mt-4">
        <SettingRow
          id="cover-cache"
          labelFor={false}
          label="Cover cache"
          help={
            <span className="tabular">
              {cache
                ? `${formatBytes(cache.bytes)} in ${plural(cache.files, 'thumbnail')}`
                : 'Thumbnails of every series cover.'}
            </span>
          }
          control={
            <Button
              variant="ghost"
              size="sm"
              disabled={!library.available || busy || cache?.files === 0}
              aria-describedby="cover-cache-label cover-cache-help"
              onClick={() => void library.clearCovers()}
            >
              Clear
            </Button>
          }
        />
        <SettingRow
          id="hidden-progress"
          labelFor={false}
          label="Clean up hidden progress"
          help="Progress and series settings of removed folders, kept in case the folder comes back."
          control={
            <ConfirmButton
              variant="ghost"
              size="sm"
              disabled={!library.available || busy}
              aria-describedby="hidden-progress-help"
              title="Delete hidden progress?"
              description="Reading progress and series settings of folders you removed are deleted for good. Progress of folders still in the library is not touched."
              confirmLabel="Delete"
              danger
              onConfirm={() => void library.purge()}
            >
              Clean up
            </ConfirmButton>
          }
        />
      </SettingsList>

      <div aria-live="polite" className="mt-3 text-sm empty:mt-0">
        {library.error && <p className="m-0 whitespace-pre-line text-err">{library.error}</p>}
        {library.notice && <p className="m-0 text-fg-2">{library.notice}</p>}
      </div>
    </SettingsSection>
  );
}
