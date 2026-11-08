import type { ReactNode } from 'react';
import { LoaderCircle, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { formatBytes } from '@/lib/reader';
import { cn } from '@/lib/utils';
import { fileName, type BackupManifest, type BackupProblem } from '@/lib/settings/data';

import { formatAgo, plural } from './format';
import type { BackupControls } from './useBackup';

const dateTime = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

/** `8 Nov 2026, 14:05 (2 hours ago)`. */
export function formatBackupDate(createdAt: number): string {
  return `${dateTime.format(createdAt)} (${formatAgo(createdAt)})`;
}

function Spinner() {
  return <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />;
}

/**
 * A refused action: the plain sentence, with the raw message folded away.
 * `inline` drops the box, for a settings row.
 */
export function Problem({ problem, inline = false }: { problem: BackupProblem; inline?: boolean }) {
  return (
    <div
      role="alert"
      className={cn(
        'grid gap-2',
        !inline && 'rounded-chip border border-err/40 bg-err/10 px-4 py-3'
      )}
    >
      <p className="m-0 flex items-start gap-2 text-sm text-fg-1">
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-err" />
        {problem.summary}
      </p>
      {problem.detail !== problem.summary && (
        <details className="ml-6 text-xs text-fg-3">
          <summary className="cursor-pointer select-none hover:text-fg-2">Details</summary>
          <code className="mt-1 block font-mono wrap-anywhere">{problem.detail}</code>
        </details>
      )}
    </div>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 px-4 py-2.5 [&+&]:border-t [&+&]:border-line">
      <dt className="text-sm text-fg-3">{term}</dt>
      <dd className="tabular m-0 text-sm text-fg-1">{children}</dd>
    </div>
  );
}

/** What a backup holds, read from its manifest by `backup_inspect`. */
export function ManifestFacts({ manifest }: { manifest: BackupManifest }) {
  return (
    <dl className="m-0 rounded-chip border border-line bg-ink-2/60">
      <Fact term="Made">{formatBackupDate(manifest.createdAt)}</Fact>
      <Fact term="App version">KireiManga {manifest.appVersion}</Fact>
      <Fact term="Library schema">Version {manifest.schemaVersion}</Fact>
      <Fact term="Database">{formatBytes(manifest.databaseBytes)}</Fact>
      <Fact term="Covers">
        {manifest.includesCovers
          ? `${plural(manifest.coverCount, 'cover')} included`
          : 'Not included, a scan makes them again'}
      </Fact>
    </dl>
  );
}

export function CreateBackupDialog({ backup }: { backup: BackupControls }) {
  const { create } = backup;
  const saving = create.step === 'saving';
  return (
    <Dialog
      open={create.step !== 'closed'}
      onOpenChange={open => !open && !saving && backup.closeCreate()}
    >
      <DialogContent hideClose={saving}>
        <DialogHeader>
          <DialogTitle>Create a backup</DialogTitle>
          <DialogDescription>
            One file with your library, reading progress and settings. Your manga files are not part
            of it.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-6 rounded-chip border border-line bg-ink-2/60 px-4 py-3">
          <div className="min-w-0">
            <label htmlFor="backup-covers" className="block text-sm font-medium">
              Include covers
            </label>
            <p id="backup-covers-help" className="m-0 mt-0.5 text-sm text-fg-3">
              Makes the file larger. Without them, a scan after restoring makes them again.
            </p>
          </div>
          <Switch
            id="backup-covers"
            aria-describedby="backup-covers-help"
            checked={backup.includeCovers}
            disabled={saving}
            onCheckedChange={backup.setIncludeCovers}
          />
        </div>
        {create.step === 'choose' && create.problem && <Problem problem={create.problem} />}
        <DialogFooter>
          <Button variant="ghost" disabled={saving} onClick={backup.closeCreate}>
            Cancel
          </Button>
          <Button variant="primary" disabled={saving} onClick={() => void backup.saveBackup()}>
            {saving ? (
              <>
                <Spinner /> Saving
              </>
            ) : (
              'Choose where to save'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RestoreBackupDialog({ backup }: { backup: BackupControls }) {
  const { restore } = backup;
  if (restore.step === 'closed' || restore.step === 'inspecting') return null;
  const busy = restore.step === 'staging' || restore.step === 'restarting';
  const name = fileName(restore.path);

  return (
    <Dialog open onOpenChange={open => !open && backup.closeRestore()}>
      <DialogContent hideClose={busy}>
        {restore.step === 'refused' ? (
          <>
            <DialogHeader>
              <DialogTitle>This backup cannot be restored</DialogTitle>
              <DialogDescription>
                <code className="font-mono text-[13px] wrap-anywhere">{name}</code>
              </DialogDescription>
            </DialogHeader>
            <Problem problem={restore.problem} />
            <DialogFooter>
              <Button variant="ghost" onClick={backup.closeRestore}>
                Close
              </Button>
              <Button onClick={() => void backup.pickRestore()}>Choose another file</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Restore this backup?</DialogTitle>
              <DialogDescription>
                <code className="font-mono text-[13px] wrap-anywhere">{name}</code>
              </DialogDescription>
            </DialogHeader>
            <ManifestFacts manifest={restore.manifest} />
            <p className="m-0 text-sm text-fg-2">
              Your current library, progress and settings are not deleted: they are moved aside to
              the <span className="font-mono text-[13px]">backups</span> folder in your data folder.
              KireiManga restarts to swap in the backup.
            </p>
            {restore.step === 'review' && restore.problem && <Problem problem={restore.problem} />}
            <DialogFooter>
              <Button variant="ghost" disabled={busy} onClick={backup.closeRestore}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => void backup.confirmRestore()}
              >
                {busy ? (
                  <>
                    <Spinner /> {restore.step === 'staging' ? 'Preparing' : 'Restarting'}
                  </>
                ) : (
                  'Restore and restart'
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
