import { describe, expect, it } from 'vitest';

import { describeUpdate } from './updater';

describe('describeUpdate', () => {
  it('names both versions when an update is ready', () => {
    expect(
      describeUpdate({
        step: 'checked',
        check: { kind: 'available', current: '1.0.0-rc.1', version: '1.0.0-rc.2', notes: null },
      })
    ).toBe('Version 1.0.0-rc.2 is ready to install (you have 1.0.0-rc.1).');
  });

  it('says so when the build has no updater', () => {
    expect(describeUpdate({ step: 'checked', check: { kind: 'disabled' } })).toMatch(
      /not available in this build/
    );
  });

  it('confirms the installed version when up to date', () => {
    expect(describeUpdate({ step: 'checked', check: { kind: 'upToDate', current: '1.0.0' } })).toBe(
      'You have the latest version (1.0.0).'
    );
  });

  it('carries the reason of a failure', () => {
    expect(describeUpdate({ step: 'failed', message: 'signature mismatch' })).toContain(
      'signature mismatch'
    );
  });
});
