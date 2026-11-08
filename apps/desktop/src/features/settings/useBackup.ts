import { useCallback, useEffect, useRef, useState } from 'react';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';

import { isTauri } from '@/lib/ipc';
import {
  BACKUP_EXTENSION,
  backupFileName,
  createBackup,
  describeBackupError,
  getDataInfo,
  inspectBackup,
  restartApp,
  restoreBackup,
  type BackupManifest,
  type BackupProblem,
  type DataInfo,
  withBackupExtension,
} from '@/lib/settings/data';

const FILTERS = [{ name: 'KireiManga backup', extensions: [BACKUP_EXTENSION] }];

/** The create dialog. */
export type CreateState =
  { step: 'closed' } | { step: 'choose'; problem: BackupProblem | null } | { step: 'saving' };

/** The restore dialog, from the picked file to the restart. */
export type RestoreState =
  | { step: 'closed' }
  | { step: 'inspecting'; path: string }
  | { step: 'review'; path: string; manifest: BackupManifest; problem: BackupProblem | null }
  | { step: 'refused'; path: string; problem: BackupProblem }
  | { step: 'staging'; path: string; manifest: BackupManifest }
  | { step: 'restarting'; path: string; manifest: BackupManifest };

/** The last backup written in this session, for the row's help line. */
export interface SavedBackup {
  path: string;
  manifest: BackupManifest;
}

/**
 * State and actions of the Data section: where the data lives, and the
 * backup and restore flows over the `backup_*` commands. Outside Tauri it
 * stays empty and every action is a no-op.
 */
export function useBackup() {
  const [info, setInfo] = useState<DataInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [create, setCreate] = useState<CreateState>({ step: 'closed' });
  const [includeCovers, setIncludeCovers] = useState(false);
  const [saved, setSaved] = useState<SavedBackup | null>(null);
  const [restore, setRestore] = useState<RestoreState>({ step: 'closed' });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (isTauri()) {
      getDataInfo().then(
        next => mounted.current && setInfo(next),
        (e: unknown) => mounted.current && setInfoError(describeBackupError(e).detail)
      );
    }
    return () => {
      mounted.current = false;
    };
  }, []);

  const openCreate = useCallback(() => setCreate({ step: 'choose', problem: null }), []);
  const closeCreate = useCallback(() => setCreate({ step: 'closed' }), []);

  /** Asks where to save, then writes the backup. Cancelling the picker keeps the dialog. */
  const saveBackup = useCallback(async () => {
    const path = await saveDialog({
      title: 'Save a KireiManga backup',
      defaultPath: backupFileName(),
      filters: FILTERS,
    });
    if (!path) return;
    const target = withBackupExtension(path);
    setCreate({ step: 'saving' });
    try {
      const manifest = await createBackup(target, includeCovers);
      if (!mounted.current) return;
      setSaved({ path: target, manifest });
      setCreate({ step: 'closed' });
    } catch (e) {
      if (mounted.current) setCreate({ step: 'choose', problem: describeBackupError(e) });
    }
  }, [includeCovers]);

  /** Asks for a backup file and checks it before anything else happens. */
  const pickRestore = useCallback(async () => {
    const picked = await openDialog({
      title: 'Restore a KireiManga backup',
      multiple: false,
      directory: false,
      filters: FILTERS,
    });
    if (typeof picked !== 'string') return;
    setRestore({ step: 'inspecting', path: picked });
    try {
      const manifest = await inspectBackup(picked);
      if (mounted.current) setRestore({ step: 'review', path: picked, manifest, problem: null });
    } catch (e) {
      if (mounted.current)
        setRestore({ step: 'refused', path: picked, problem: describeBackupError(e) });
    }
  }, []);

  /** Stages the reviewed backup, then restarts so the swap happens. */
  const confirmRestore = useCallback(async () => {
    if (restore.step !== 'review') return;
    const { path, manifest } = restore;
    setRestore({ step: 'staging', path, manifest });
    try {
      await restoreBackup(path);
      if (!mounted.current) return;
      setRestore({ step: 'restarting', path, manifest });
      await restartApp();
    } catch (e) {
      if (mounted.current)
        setRestore({ step: 'review', path, manifest, problem: describeBackupError(e) });
    }
  }, [restore]);

  const closeRestore = useCallback(() => {
    setRestore(current =>
      current.step === 'staging' || current.step === 'restarting' ? current : { step: 'closed' }
    );
  }, []);

  return {
    available: isTauri(),
    info,
    infoError,
    create,
    includeCovers,
    setIncludeCovers,
    saved,
    openCreate,
    closeCreate,
    saveBackup,
    restore,
    pickRestore,
    confirmRestore,
    closeRestore,
  };
}

export type BackupControls = ReturnType<typeof useBackup>;
