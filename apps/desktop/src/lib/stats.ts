import { invoke } from '@tauri-apps/api/core';

import type { CoverRef } from './library';

/** Sums over a set of reading sessions, mirrors `kirei_library::ReadingTotals`. */
export interface ReadingTotals {
  activeMs: number;
  sessions: number;
  pagesTurned: number;
  chaptersFinished: number;
  daysRead: number;
  seriesRead: number;
}

/** A run of consecutive reading days, mirrors `kirei_library::Streak`. */
export interface Streak {
  days: number;
  /** `YYYY-MM-DD`, null when there is no streak. */
  start: string | null;
  end: string | null;
}

/** One local day with reading, mirrors `kirei_library::ReadingDay`. */
export interface ReadingDay {
  date: string;
  activeMs: number;
  pagesTurned: number;
  chaptersFinished: number;
  sessions: number;
}

/** One series and the reading it got, mirrors `kirei_library::SeriesReading`. */
export interface SeriesReading {
  /** Null when the series is no longer in the library. */
  seriesId: number | null;
  title: string;
  cover: CoverRef | null;
  activeMs: number;
  pagesTurned: number;
  chaptersFinished: number;
  sessions: number;
  daysRead: number;
}

/** Mirrors `kirei_library::ReadingStats`. */
export interface ReadingStats {
  year: number;
  /** Today in the reader's time zone, `YYYY-MM-DD`. */
  today: string;
  /** Years with reading, newest first, always with the current year. */
  years: number[];
  allTime: ReadingTotals;
  yearTotals: ReadingTotals;
  currentStreak: Streak;
  longestStreak: Streak;
  yearLongestStreak: Streak;
  /** Days of `year` with reading, oldest first. */
  days: ReadingDay[];
  /** Active time per month of `year`, January first. */
  months: number[];
  topSeries: SeriesReading[];
  longestSessionMs: number;
}

/** Minutes east of UTC right now, the way the library stores it (UTC+2 is 120). */
export function utcOffsetMinutes(at: Date = new Date()): number {
  return -at.getTimezoneOffset();
}

export function getReadingStats(year: number): Promise<ReadingStats> {
  return invoke<ReadingStats>('stats_get', { year, utcOffsetMin: utcOffsetMinutes() });
}

/** How many reading sessions `clearReadingStats` would delete. Deletes nothing. */
export function countReadingSessions(): Promise<number> {
  return invoke<number>('stats_count');
}

/** Deletes every reading session; progress and the library stay. Resolves to how many went. */
export function clearReadingStats(): Promise<number> {
  return invoke<number>('stats_clear');
}

/** The JPEG bytes of a cover thumbnail, for drawing on a canvas without tainting it. */
export async function getCoverBytes(hash: string): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>('stats_cover', { hash });
}

/** Writes a PNG to `path` (from the save dialog); resolves to the path written. */
export function saveCardPng(path: string, png: Uint8Array): Promise<string> {
  return invoke<string>('stats_save_card', png, {
    headers: { 'x-kirei-path': encodeURIComponent(path) },
  });
}
