//! The progress sync rules and the delivery of one queued update.
//!
//! The rules are a pure function ([`decide`]) so they can be table tested.
//! AniList counts progress in whole chapters read; the library knows which
//! chapters were completed. See `docs/tracking.md` for the rules in prose.

use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::client::AniList;
use crate::error::AniListError;
use crate::model::{EntryUpdate, ListEntry, ListStatus};

/// What wins when the two sides disagree.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ConflictPolicy {
    /// The higher progress wins: AniList is never moved backwards. Remote
    /// progress ahead of local is kept and shown.
    #[default]
    Higher,
    /// AniList follows the chapter last finished here, even when that is
    /// lower (rereading). Only when AniList has not moved since the last sync,
    /// so progress made on another device is never overwritten.
    Local,
}

/// What to do about one series.
#[derive(Debug, Clone, PartialEq)]
pub enum Decision {
    /// Both sides agree; nothing to send.
    InSync,
    /// Send this update.
    Push(EntryUpdate),
    /// AniList is ahead of the local progress and the policy keeps it. The
    /// remote progress is stored and shown, the local one is left alone.
    RemoteAhead { remote: i64 },
}

/// Decides what to send for local progress `local` (chapters read).
///
/// `remote` is the viewer's entry (`None` when the series is not on their
/// list), `synced` the progress both sides last agreed on, `total` the
/// series' chapter count when AniList knows it.
pub fn decide(
    local: i64,
    remote: Option<&ListEntry>,
    synced: Option<i64>,
    total: Option<i64>,
    policy: ConflictPolicy,
) -> Decision {
    let local = local.max(0);
    let finished = total.is_some_and(|total| total > 0 && local >= total);
    let Some(entry) = remote else {
        if local == 0 {
            return Decision::InSync;
        }
        return Decision::Push(EntryUpdate {
            progress: Some(local),
            status: Some(if finished {
                ListStatus::Completed
            } else {
                ListStatus::Current
            }),
            score: None,
        });
    };
    let remote_progress = entry.progress;
    if local == remote_progress {
        return Decision::InSync;
    }
    if local > remote_progress {
        return Decision::Push(EntryUpdate {
            progress: Some(local),
            status: status_after_reading(entry.status, finished),
            score: None,
        });
    }
    // Local is behind AniList.
    let remote_unchanged = synced == Some(remote_progress);
    match policy {
        ConflictPolicy::Local if remote_unchanged => Decision::Push(EntryUpdate {
            progress: Some(local),
            // Going back over a finished series is a reread.
            status: match entry.status {
                Some(ListStatus::Completed) => Some(ListStatus::Repeating),
                other => status_after_reading(other, finished),
            },
            score: None,
        }),
        _ => Decision::RemoteAhead {
            remote: remote_progress,
        },
    }
}

/// The status to send along with new progress, or `None` to leave it.
fn status_after_reading(current: Option<ListStatus>, finished: bool) -> Option<ListStatus> {
    if finished {
        return match current {
            Some(ListStatus::Completed) => None,
            _ => Some(ListStatus::Completed),
        };
    }
    match current {
        Some(ListStatus::Current | ListStatus::Repeating) => None,
        // Reading again resumes a paused or dropped series, starts a planned
        // one, and reopens a finished one that got new chapters.
        Some(ListStatus::Planning | ListStatus::Paused | ListStatus::Dropped)
        | Some(ListStatus::Completed)
        | None => Some(ListStatus::Current),
    }
}

/// Chapters read, from the library's chapters as `(number, completed)`:
/// the highest whole chapter number among completed chapters, or the count
/// of completed chapters when none of them is numbered.
pub fn chapters_read<I>(chapters: I) -> i64
where
    I: IntoIterator<Item = (Option<f64>, bool)>,
{
    let mut highest: Option<i64> = None;
    let mut count = 0i64;
    for (number, completed) in chapters {
        if !completed {
            continue;
        }
        count += 1;
        if let Some(number) = number.filter(|n| n.is_finite() && *n >= 0.0) {
            let whole = number.floor() as i64;
            highest = Some(highest.map_or(whole, |h| h.max(whole)));
        }
    }
    highest.unwrap_or(count)
}

/// The progress a just finished chapter stands for: its whole number, or its
/// 1 based place in the series when it has none.
pub fn chapter_position(number: Option<f64>, index: usize) -> i64 {
    match number.filter(|n| n.is_finite() && *n >= 0.0) {
        Some(number) => number.floor() as i64,
        None => i64::try_from(index).unwrap_or(i64::MAX - 1) + 1,
    }
}

/// How long a failed update waits before its next try: 30 s, doubling per
/// attempt, at most an hour.
pub fn retry_delay(attempts: u32) -> Duration {
    let secs = 30u64.saturating_mul(1u64 << attempts.min(7));
    Duration::from_secs(secs.min(60 * 60))
}

/// An update waiting in the app's queue.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingUpdate {
    pub media_id: i64,
    /// Local progress to reconcile with AniList under the conflict rules.
    pub progress: Option<i64>,
    /// A status the user picked; sent as is.
    pub status: Option<ListStatus>,
    /// A score the user picked (0 to 100); sent as is.
    pub score: Option<i64>,
    /// The progress both sides last agreed on.
    pub synced: Option<i64>,
    /// Failed attempts so far.
    pub attempts: u32,
}

/// What became of one delivery.
#[derive(Debug)]
pub enum Delivery {
    /// AniList now holds `entry`.
    Sent {
        entry: ListEntry,
        total: Option<i64>,
    },
    /// Nothing needed sending; `entry` is what AniList holds.
    InSync {
        entry: Option<ListEntry>,
        total: Option<i64>,
    },
    /// AniList is ahead and keeps its progress.
    RemoteAhead {
        entry: ListEntry,
        total: Option<i64>,
    },
    /// Try again after `after` (offline, rate limited, AniList down).
    Retry { error: String, after: Duration },
    /// Waits for the user to sign in again; keep it queued.
    NeedsSignIn { error: String },
    /// AniList refused it for good (no such series, invalid value).
    Failed { error: String },
}

/// Reconciles `update` with AniList: reads the entry, applies [`decide`] to
/// the progress, and saves what needs saving.
pub async fn deliver(client: &AniList, update: &PendingUpdate, policy: ConflictPolicy) -> Delivery {
    let media = match client.manga(update.media_id).await {
        Ok(media) => media,
        Err(error) => return failure(&error, update.attempts),
    };
    let total = media.chapters;
    let mut change = EntryUpdate::default();
    let mut ahead = false;
    if let Some(progress) = update.progress {
        match decide(
            progress,
            media.list_entry.as_ref(),
            update.synced,
            total,
            policy,
        ) {
            Decision::InSync => {}
            Decision::Push(push) => change = push,
            Decision::RemoteAhead { .. } => ahead = true,
        }
    }
    // An explicit choice of the user wins over the derived status.
    if update.status.is_some() {
        change.status = update.status;
    }
    if update.score.is_some() {
        change.score = update.score;
    }
    if change.is_empty() {
        return match (ahead, media.list_entry) {
            (true, Some(entry)) => Delivery::RemoteAhead { entry, total },
            (_, entry) => Delivery::InSync { entry, total },
        };
    }
    match client.save_entry(update.media_id, &change).await {
        Ok(entry) => Delivery::Sent { entry, total },
        Err(error) => failure(&error, update.attempts),
    }
}

fn failure(error: &AniListError, attempts: u32) -> Delivery {
    let message = error.to_string();
    if error.needs_sign_in() {
        return Delivery::NeedsSignIn { error: message };
    }
    if error.is_transient() {
        let mut after = retry_delay(attempts);
        if let AniListError::RateLimited { retry_after } = error {
            after = after.max(*retry_after);
        }
        return Delivery::Retry {
            error: message,
            after,
        };
    }
    Delivery::Failed { error: message }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ConflictPolicy::{Higher, Local};
    use ListStatus::*;

    fn entry(progress: i64, status: ListStatus) -> ListEntry {
        ListEntry {
            id: 1,
            status: Some(status),
            progress,
            score: 0.0,
            repeat: 0,
            updated_at: None,
        }
    }

    fn push(progress: i64, status: Option<ListStatus>) -> Decision {
        Decision::Push(EntryUpdate {
            progress: Some(progress),
            status,
            score: None,
        })
    }

    /// Every row: local, remote (progress, status), synced, total, policy,
    /// expected decision.
    #[test]
    fn conflict_rules() {
        type Row = (
            &'static str,
            i64,
            Option<(i64, ListStatus)>,
            Option<i64>,
            Option<i64>,
            ConflictPolicy,
            Decision,
        );
        let rows: Vec<Row> = vec![
            (
                "nothing read, not listed",
                0,
                None,
                None,
                None,
                Higher,
                Decision::InSync,
            ),
            (
                "first chapter adds it as reading",
                1,
                None,
                None,
                None,
                Higher,
                push(1, Some(Current)),
            ),
            (
                "first sync of a finished series",
                12,
                None,
                None,
                Some(12),
                Higher,
                push(12, Some(Completed)),
            ),
            (
                "equal is in sync",
                5,
                Some((5, Current)),
                Some(5),
                None,
                Higher,
                Decision::InSync,
            ),
            (
                "local ahead pushes",
                6,
                Some((5, Current)),
                Some(5),
                None,
                Higher,
                push(6, None),
            ),
            (
                "local ahead of a planned series starts it",
                1,
                Some((0, Planning)),
                None,
                None,
                Higher,
                push(1, Some(Current)),
            ),
            (
                "reading resumes a paused series",
                8,
                Some((7, Paused)),
                Some(7),
                None,
                Higher,
                push(8, Some(Current)),
            ),
            (
                "reading resumes a dropped series",
                8,
                Some((7, Dropped)),
                Some(7),
                None,
                Higher,
                push(8, Some(Current)),
            ),
            (
                "a reread keeps its status",
                3,
                Some((2, Repeating)),
                Some(2),
                None,
                Higher,
                push(3, None),
            ),
            (
                "the last chapter completes",
                20,
                Some((19, Current)),
                Some(19),
                Some(20),
                Higher,
                push(20, Some(Completed)),
            ),
            (
                "past the known total completes",
                22,
                Some((19, Current)),
                Some(19),
                Some(20),
                Higher,
                push(22, Some(Completed)),
            ),
            (
                "new chapters reopen a completed series",
                21,
                Some((20, Completed)),
                Some(20),
                None,
                Higher,
                push(21, Some(Current)),
            ),
            (
                "remote ahead is kept under higher",
                4,
                Some((9, Current)),
                Some(4),
                None,
                Higher,
                Decision::RemoteAhead { remote: 9 },
            ),
            (
                "remote ahead is kept under higher even unchanged",
                4,
                Some((9, Current)),
                Some(9),
                None,
                Higher,
                Decision::RemoteAhead { remote: 9 },
            ),
            (
                "local policy rereads lower when remote is unchanged",
                3,
                Some((9, Current)),
                Some(9),
                None,
                Local,
                push(3, None),
            ),
            (
                "local policy turns a completed series into a reread",
                1,
                Some((20, Completed)),
                Some(20),
                Some(20),
                Local,
                push(1, Some(Repeating)),
            ),
            (
                "local policy never overwrites progress made elsewhere",
                3,
                Some((12, Current)),
                Some(9),
                None,
                Local,
                Decision::RemoteAhead { remote: 12 },
            ),
            (
                "local policy without a sync record keeps remote",
                3,
                Some((12, Current)),
                None,
                None,
                Local,
                Decision::RemoteAhead { remote: 12 },
            ),
            (
                "local policy still pushes when ahead",
                13,
                Some((12, Current)),
                Some(9),
                None,
                Local,
                push(13, None),
            ),
            (
                "negative local counts as nothing",
                -4,
                None,
                None,
                None,
                Higher,
                Decision::InSync,
            ),
        ];
        for (name, local, remote, synced, total, policy, expected) in rows {
            let remote = remote.map(|(progress, status)| entry(progress, status));
            assert_eq!(
                decide(local, remote.as_ref(), synced, total, policy),
                expected,
                "{name}"
            );
        }
    }

    #[test]
    fn chapters_read_uses_numbers_then_counts() {
        assert_eq!(chapters_read([]), 0);
        assert_eq!(
            chapters_read([(Some(1.0), true), (Some(2.0), true), (Some(3.0), false)]),
            2
        );
        // A half chapter counts as the whole one before it.
        assert_eq!(chapters_read([(Some(10.5), true)]), 10);
        // Read out of order: the highest finished number counts.
        assert_eq!(chapters_read([(Some(7.0), true), (Some(2.0), true)]), 7);
        assert_eq!(
            chapters_read([(None, true), (None, true), (None, false)]),
            2
        );
        assert_eq!(chapters_read([(Some(f64::NAN), true)]), 1);
    }

    #[test]
    fn chapter_position_prefers_the_number() {
        assert_eq!(chapter_position(Some(12.5), 3), 12);
        assert_eq!(chapter_position(None, 3), 4);
        assert_eq!(chapter_position(Some(-1.0), 0), 1);
    }

    #[test]
    fn retries_back_off_to_an_hour() {
        assert_eq!(retry_delay(0), Duration::from_secs(30));
        assert_eq!(retry_delay(1), Duration::from_secs(60));
        assert_eq!(retry_delay(5), Duration::from_secs(960));
        assert_eq!(retry_delay(7), Duration::from_secs(3600));
        assert_eq!(retry_delay(40), Duration::from_secs(3600));
    }
}
