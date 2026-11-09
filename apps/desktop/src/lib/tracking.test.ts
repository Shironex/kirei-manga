import { describe, expect, it } from 'vitest';

import {
  describeProgress,
  describeQueue,
  mediaTitle,
  type SeriesTracking,
  type TrackerLink,
} from './tracking';

function link(overrides: Partial<TrackerLink> = {}): TrackerLink {
  return {
    seriesKey: 'local:dir:Ash',
    mediaId: 30013,
    source: 'manual',
    title: 'Ash and Ember',
    totalChapters: null,
    remoteProgress: 7,
    remoteStatus: 'CURRENT',
    remoteScore: 0,
    remoteCheckedAt: 1000,
    syncedProgress: 7,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function state(localProgress: number | null, overrides: Partial<TrackerLink> = {}): SeriesTracking {
  return { seriesKey: 'local:dir:Ash', link: link(overrides), localProgress, queued: null };
}

describe('mediaTitle', () => {
  it('prefers the viewer choice, then English, romaji and native', () => {
    const title = { userPreferred: null, english: 'Moonlit Road', romaji: 'Tsuki', native: null };
    expect(mediaTitle({ title })).toBe('Moonlit Road');
    expect(mediaTitle({ title: { ...title, userPreferred: 'Tsuki' } })).toBe('Tsuki');
    expect(
      mediaTitle({ title: { userPreferred: ' ', english: null, romaji: null, native: null } })
    ).toBe('Untitled');
  });
});

describe('describeProgress', () => {
  it('says nothing before AniList was read', () => {
    expect(describeProgress(state(3, { remoteCheckedAt: null }))).toBeNull();
    expect(describeProgress({ seriesKey: 'x', link: null, localProgress: 3, queued: null })).toBe(
      null
    );
  });

  it('flags remote progress ahead of local', () => {
    expect(describeProgress(state(4, { totalChapters: 20 }))).toBe(
      'AniList is ahead: chapter 7 of 20 there, 4 read here.'
    );
  });

  it('reports agreement and series not on the list', () => {
    expect(describeProgress(state(7))).toBe('Chapter 7 on AniList.');
    expect(describeProgress(state(2, { remoteProgress: null }))).toBe(
      'Not on your AniList list yet.'
    );
    expect(describeProgress(state(9))).toBe('Chapter 7 on AniList, 9 read here.');
  });
});

describe('describeQueue', () => {
  const empty = { pending: 0, blocked: 0, failed: 0, nextAttemptAt: null, lastError: null };

  it('says all is sent when nothing waits', () => {
    expect(describeQueue(empty)).toBe('Everything is on AniList.');
  });

  it('counts what waits and why', () => {
    expect(
      describeQueue(
        {
          pending: 2,
          blocked: 1,
          failed: 1,
          nextAttemptAt: 10 * 60_000,
          lastError: 'cannot reach AniList',
        },
        0
      )
    ).toBe(
      '2 waiting, next in 10 min, 1 held until you sign in, 1 refused by AniList. Last error: cannot reach AniList'
    );
    expect(describeQueue({ ...empty, pending: 1, nextAttemptAt: 5 }, 10)).toBe(
      '1 waiting, next now.'
    );
  });
});
