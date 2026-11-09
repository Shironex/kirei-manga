//! Keeping the updates feed fresh: one refresh (follows, the feed, read
//! markers), the background schedule, the system notification for new
//! chapters and the hand over of new chapters to automatic downloads.
//!
//! A refresh costs a handful of requests (one per 100 follows, one per 100
//! feed chapters, one for the statuses and one per 100 series for read
//! markers), and runs every 30 minutes at most, far inside MangaDex's limits.
//! The client's rate limiter guards the rest. A rate limit or ban answer
//! pushes the next scheduled refresh back instead of retrying.

use std::collections::{BTreeMap, HashMap};
use std::time::Duration;

use kirei_mangadex::{Chapter, LanguagePrefs, Manga};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_notification::NotificationExt;

use super::commands::OnlineError;
use super::sync::{self, FeedRefresh};
use super::{FEED_EVENT, Health, Online, Session};
use crate::catalog::Catalog;

/// Time between scheduled refreshes.
const INTERVAL: Duration = Duration::from_secs(30 * 60);
/// Wait after launch before the first scheduled refresh, so start-up stays
/// quiet.
const FIRST_DELAY: Duration = Duration::from_secs(20);
/// Wait after a failed refresh (offline) before trying again.
const RETRY_DELAY: Duration = Duration::from_secs(5 * 60);

/// Why a refresh runs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Trigger {
    /// Right after signing in: fill everything, announce nothing.
    SignIn,
    /// The background schedule: announce new chapters.
    Scheduled,
}

/// One refresh: follows and statuses, then the feed, then read markers of
/// the series in the feed. One at a time; a second caller waits for the
/// first and refreshes after it. `announce` sends a notification for new
/// chapters (when the setting allows); otherwise they count as seen.
pub(crate) async fn refresh<R: Runtime>(
    app: &AppHandle<R>,
    announce: bool,
) -> Result<FeedRefresh, OnlineError> {
    let online = app.state::<Online>();
    let library = app
        .state::<Catalog>()
        .library()
        .map_err(|message| OnlineError {
            kind: super::commands::ErrorKind::Other,
            message,
            retry_after_secs: None,
        })?;
    let _single = online.refreshing.lock().await;
    let md = online.client();

    let tracked = |error: sync::SyncError| -> OnlineError {
        if let sync::SyncError::MangaDex(error) = &error {
            online.note(error);
        }
        error.into()
    };
    let follows = sync::refresh_follows(md, &library).await.map_err(tracked)?;
    let feed = sync::refresh_feed(md, &library).await.map_err(tracked)?;
    let mut feed_series: Vec<String> = library
        .online_feed(500)?
        .into_iter()
        .map(|item| item.manga_id)
        .collect();
    feed_series.sort_unstable();
    feed_series.dedup();
    sync::sync_markers(md, &library, &feed_series)
        .await
        .map_err(tracked)?;
    online.track(Ok(()))?;

    // New chapters of followed series go to the download queue when the
    // user asked for that (`downloads.autoFollows`, checked by downloads).
    // The first refresh only fills the feed, so it queues nothing.
    if !feed.first
        && !feed.fresh.is_empty()
        && let Err(error) = crate::downloads::auto_download_new(app, &feed.fresh)
    {
        eprintln!("new chapters not queued for download: {error}");
    }

    let unannounced: Vec<String> = library
        .online_feed(500)?
        .into_iter()
        .filter(|item| !item.notified && feed.fresh.contains(&item.chapter_id))
        .map(|item| item.chapter_id)
        .collect();
    if !unannounced.is_empty() {
        if announce && online.notifications() && !feed.first {
            let chapters: Vec<Chapter> = library
                .online_feed(500)?
                .into_iter()
                .filter(|item| unannounced.contains(&item.chapter_id))
                .filter_map(|item| serde_json::from_value(item.data).ok())
                .collect();
            if let Some((title, body)) = notification_text(&chapters, &follows, &md.languages()) {
                let shown = app.notification().builder().title(title).body(body).show();
                if let Err(error) = shown {
                    eprintln!("new chapter notification not shown: {error}");
                }
            }
        }
        library.online_mark_notified(&unannounced)?;
    }
    let _ = app.emit(FEED_EVENT, ());
    Ok(feed)
}

/// Runs a refresh and logs a failure instead of returning it.
pub(crate) async fn run<R: Runtime>(app: &AppHandle<R>, trigger: Trigger) {
    if let Err(error) = refresh(app, trigger == Trigger::Scheduled).await {
        eprintln!("MangaDex refresh failed: {}", error.message);
    }
}

/// Starts the background schedule: a refresh shortly after launch, then
/// every 30 minutes while signed in with auto refresh on. A rate limit waits
/// until MangaDex allows requests again; offline waits five minutes.
pub(crate) fn start<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_DELAY).await;
        loop {
            let online = app.state::<Online>();
            let mut wait = INTERVAL;
            if online.auto_refresh() && online.session() == Session::SignedIn {
                run(&app, Trigger::Scheduled).await;
                wait = next_wait(online.account().health, sync::now_ms());
            }
            tokio::time::sleep(wait).await;
        }
    });
}

/// How long to wait before the next scheduled refresh, given the network
/// state the last one left.
pub(crate) fn next_wait(health: Health, now_ms: u64) -> Duration {
    match health {
        Health::Online => INTERVAL,
        Health::Offline => RETRY_DELAY,
        Health::RateLimited { until } => {
            Duration::from_millis(until.saturating_sub(now_ms)).max(RETRY_DELAY)
        }
        Health::Blocked => INTERVAL * 2,
    }
}

fn chapter_label(chapter: &Chapter) -> String {
    match (&chapter.chapter, &chapter.title) {
        (Some(number), _) => format!("Ch. {number}"),
        (None, Some(title)) if !title.trim().is_empty() => title.clone(),
        _ => "Oneshot".to_owned(),
    }
}

/// The notification for new chapters: one series names it and its
/// chapters, several give the count and the first titles. `None` when there
/// is nothing to say.
pub(crate) fn notification_text(
    chapters: &[Chapter],
    follows: &[Manga],
    prefs: &LanguagePrefs,
) -> Option<(String, String)> {
    if chapters.is_empty() {
        return None;
    }
    let titles: HashMap<&str, String> = follows
        .iter()
        .map(|manga| {
            (
                manga.id.as_str(),
                manga
                    .display_title(prefs.chain())
                    .unwrap_or("A followed series")
                    .to_owned(),
            )
        })
        .collect();
    let mut by_series: BTreeMap<String, Vec<&Chapter>> = BTreeMap::new();
    for chapter in chapters {
        let title = chapter
            .manga_id
            .as_deref()
            .and_then(|id| titles.get(id).cloned())
            .unwrap_or_else(|| "A followed series".to_owned());
        by_series.entry(title).or_default().push(chapter);
    }
    if by_series.len() == 1 {
        let (title, list) = by_series.into_iter().next()?;
        let labels: Vec<String> = list.iter().map(|c| chapter_label(c)).collect();
        let heading = if list.len() == 1 {
            "New chapter".to_owned()
        } else {
            format!("{} new chapters", list.len())
        };
        return Some((format!("{heading}: {title}"), labels.join(", ")));
    }
    let names: Vec<&str> = by_series.keys().map(String::as_str).take(3).collect();
    let more = by_series.len().saturating_sub(names.len());
    let body = if more > 0 {
        format!("{} and {more} more", names.join(", "))
    } else {
        names.join(", ")
    };
    Some((
        format!(
            "{} new chapters in {} series",
            chapters.len(),
            by_series.len()
        ),
        body,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chapter(id: &str, manga: &str, number: Option<&str>) -> Chapter {
        serde_json::from_value(serde_json::json!({
            "id": id,
            "mangaId": manga,
            "title": null,
            "volume": null,
            "chapter": number,
            "pages": 10,
            "language": "pl",
            "externalUrl": null,
            "publishAt": null,
            "readableAt": null,
            "updatedAt": null,
            "groups": [],
            "uploader": null
        }))
        .unwrap()
    }

    fn manga(id: &str, title: &str) -> Manga {
        serde_json::from_value(serde_json::json!({
            "id": id,
            "title": { "en": title },
            "altTitles": [],
            "description": {},
            "originalLanguage": "ja",
            "status": null,
            "demographic": null,
            "contentRating": "safe",
            "year": null,
            "lastVolume": null,
            "lastChapter": null,
            "tags": [],
            "availableLanguages": [],
            "chapterNumbersResetOnNewVolume": false,
            "links": {},
            "cover": null,
            "authors": [],
            "artists": [],
            "updatedAt": null
        }))
        .unwrap()
    }

    #[test]
    fn one_series_names_its_chapters() {
        let follows = [manga("m1", "Moonlit")];
        let prefs = LanguagePrefs::default();
        let (title, body) =
            notification_text(&[chapter("a", "m1", Some("12"))], &follows, &prefs).unwrap();
        assert_eq!(title, "New chapter: Moonlit");
        assert_eq!(body, "Ch. 12");
        let (title, body) = notification_text(
            &[chapter("a", "m1", Some("12")), chapter("b", "m1", None)],
            &follows,
            &prefs,
        )
        .unwrap();
        assert_eq!(title, "2 new chapters: Moonlit");
        assert_eq!(body, "Ch. 12, Oneshot");
    }

    #[test]
    fn several_series_are_counted() {
        let follows = [
            manga("m1", "Alpha"),
            manga("m2", "Beta"),
            manga("m3", "Gamma"),
            manga("m4", "Delta"),
        ];
        let chapters = [
            chapter("a", "m1", Some("1")),
            chapter("b", "m2", Some("1")),
            chapter("c", "m3", Some("1")),
            chapter("d", "m4", Some("1")),
            chapter("e", "m4", Some("2")),
        ];
        let (title, body) =
            notification_text(&chapters, &follows, &LanguagePrefs::default()).unwrap();
        assert_eq!(title, "5 new chapters in 4 series");
        assert_eq!(body, "Alpha, Beta, Delta and 1 more");
        assert!(notification_text(&[], &follows, &LanguagePrefs::default()).is_none());
    }

    #[test]
    fn rate_limits_push_the_schedule_back() {
        assert_eq!(next_wait(Health::Online, 0), INTERVAL);
        assert_eq!(next_wait(Health::Offline, 0), RETRY_DELAY);
        assert_eq!(
            next_wait(Health::RateLimited { until: 3_600_000 }, 0),
            Duration::from_secs(3600)
        );
        assert_eq!(next_wait(Health::RateLimited { until: 10 }, 0), RETRY_DELAY);
    }
}
