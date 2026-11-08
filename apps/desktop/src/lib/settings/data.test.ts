import { describe, expect, it } from 'vitest';

import { backupFileName, describeBackupError, fileName, withBackupExtension } from './data';

describe('backup helpers', () => {
  it('names a backup after the local day', () => {
    expect(backupFileName(new Date(2026, 10, 8, 23, 59))).toBe('kireimanga-2026-11-08.kireibackup');
  });

  it('adds the extension only when it is missing', () => {
    expect(withBackupExtension('/x/library')).toBe('/x/library.kireibackup');
    expect(withBackupExtension('C:\\x\\a.KireiBackup')).toBe('C:\\x\\a.KireiBackup');
  });

  it('takes the file name from either separator', () => {
    expect(fileName('/Users/me/a.kireibackup')).toBe('a.kireibackup');
    expect(fileName('C:\\Users\\me\\b.kireibackup')).toBe('b.kireibackup');
  });
});

describe('describeBackupError', () => {
  it('asks for an update when the backup is newer', () => {
    const problem = describeBackupError(
      'this backup was made by a newer KireiManga (schema 9, this app supports up to 3); update the app to restore it'
    );
    expect(problem.summary).toMatch(/newer KireiManga\. Update the app/);
    expect(problem.detail).toContain('schema 9');
  });

  it('calls a broken or foreign file damaged', () => {
    for (const message of [
      '/x/a.zip is not a usable KireiManga backup: no manifest',
      '/x/a.kireibackup is damaged or not a KireiManga backup (invalid Zip archive)',
    ]) {
      expect(describeBackupError(new Error(message)).summary).toMatch(/damaged or is not/);
    }
  });

  it('explains a file it could not read or write', () => {
    expect(describeBackupError('cannot read /x/a: permission denied').summary).toMatch(
      /could not read or write/
    );
  });

  it('keeps unknown messages as they are', () => {
    expect(describeBackupError('disk full')).toEqual({ summary: 'disk full', detail: 'disk full' });
  });
});
