import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

const { clearReadingStats, countReadingSessions, getReadingStats, saveCardPng, utcOffsetMinutes } =
  await import('./stats');

describe('utcOffsetMinutes', () => {
  it('is minutes east of UTC, the opposite sign of getTimezoneOffset', () => {
    const warsawSummer = { getTimezoneOffset: () => -120 } as Date;
    const newYork = { getTimezoneOffset: () => 300 } as Date;
    expect(utcOffsetMinutes(warsawSummer)).toBe(120);
    expect(utcOffsetMinutes(newYork)).toBe(-300);
  });
});

describe('commands', () => {
  beforeEach(() => invoke.mockReset());

  it('asks for a year with the current offset', async () => {
    await getReadingStats(2026);
    expect(invoke).toHaveBeenLastCalledWith('stats_get', {
      year: 2026,
      utcOffsetMin: utcOffsetMinutes(),
    });
  });

  it('counts and clears sessions without arguments', async () => {
    await countReadingSessions();
    expect(invoke).toHaveBeenLastCalledWith('stats_count');
    await clearReadingStats();
    expect(invoke).toHaveBeenLastCalledWith('stats_clear');
  });

  it('sends the PNG as the raw body and the path as an encoded header', async () => {
    const png = new Uint8Array([0x89, 0x50]);
    await saveCardPng('C:\\Users\\me\\róża 2026.png', png);
    expect(invoke).toHaveBeenLastCalledWith('stats_save_card', png, {
      headers: { 'x-kirei-path': 'C%3A%5CUsers%5Cme%5Cr%C3%B3%C5%BCa%202026.png' },
    });
  });
});
