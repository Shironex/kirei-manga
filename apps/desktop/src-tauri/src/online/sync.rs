//! The online rules that need both MangaDex and the library: refreshing the
//! follow list and the updates feed, grouping the feed by series, syncing
//! read markers both ways and applying the per series language switch.
//!
//! Every function takes the client and the library explicitly, so the tests
//! run them against a local MangaDex (wiremock) and an in-memory database.

use std::collections::{BTreeMap, HashMap};

use kirei_library::{FeedItem, Library, NewFeedItem};
use kirei_mangadex::{
    Chapter, ChapterListOptions, FeedOrder, FeedQuery, LanguagePrefs, LocalizedChapters, Manga,
    MangaDex, MangaDexError, resolve_chapters,
};
use serde::Serialize;

/// Follows asked for per request (the API maximum).
const FOLLOW_PAGE: u32 = 100;
/// The most follow pages read in one refresh: 1000 series.
const MAX_FOLLOW_PAGES: u32 = 10;
/// Feed chapters asked for per request.
const FEED_PAGE: u32 = 100;
/// The most feed pages read in one refresh.
const MAX_FEED_PAGES: u32 = 5;
/// Chapters asked for per request when listing one language.
const CHAPTER_PAGE: u32 = 500;
/// The most chapter pages walked for one series.
const MAX_CHAPTER_PAGES: u32 = 40;
/// How far back the first refresh looks.
pub(crate) const FIRST_REFRESH_WINDOW_MS: u64 = 14 * 24 * 60 * 60 * 1000;
/// Overlap with the previous refresh, so a chapter published while one ran
/// is not missed.
const REFRESH_OVERLAP_MS: u64 = 60 * 60 * 1000;
/// Feed chapters older than this are forgotten.
pub(crate) const FEED_KEEP_MS: u64 = 30 * 24 * 60 * 60 * 1000;

/// Library state keys.
pub(crate) const STATE_LAST_REFRESH: &str = "feed.lastRefresh";
pub(crate) const STATE_SEEN_AT: &str = "feed.seenAt";

/// Why an online step failed: the client's error, or the database.
#[derive(Debug)]
pub(crate) enum SyncError {
    MangaDex(MangaDexError),
    Library(String),
}

impl From<MangaDexError> for SyncError {
    fn from(error: MangaDexError) -> Self {
        Self::MangaDex(error)
    }
}

impl From<kirei_library::LibraryError> for SyncError {
    fn from(error: kirei_library::LibraryError) -> Self {
        Self::Library(error.to_string())
    }
}

impl From<serde_json::Error> for SyncError {
    fn from(error: serde_json::Error) -> Self {
        Self::Library(error.to_string())
    }
}

pub(crate) type SyncResult<T> = Result<T, SyncError>;

/// Unix milliseconds from MangaDex's timestamps (`2026-01-10T12:00:00+00:00`,
/// also with a `Z` or fractional seconds). `None` when it does not parse.
pub(crate) fn parse_timestamp(text: &str) -> Option<i64> {
    let text = text.trim();
    let (date, rest) = text.split_once('T')?;
    let mut date_parts = date.splitn(3, '-');
    let year: i64 = date_parts.next()?.parse().ok()?;
    let month: i64 = date_parts.next()?.parse().ok()?;
    let day: i64 = date_parts.next()?.parse().ok()?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    // Split the time from the offset: `Z`, `+hh:mm` or `-hh:mm`.
    let (time, offset_minutes) = if let Some(time) = rest.strip_suffix('Z') {
        (time, 0)
    } else {
        let at = rest.rfind(['+', '-'])?;
        let (time, offset) = rest.split_at(at);
        let sign = if offset.starts_with('-') { -1 } else { 1 };
        let (hours, minutes) = offset[1..].split_once(':').unwrap_or((&offset[1..], "0"));
        let hours: i64 = hours.parse().ok()?;
        let minutes: i64 = minutes.parse().ok()?;
        (time, sign * (hours * 60 + minutes))
    };
    let mut time_parts = time.splitn(3, ':');
    let hour: i64 = time_parts.next()?.parse().ok()?;
    let minute: i64 = time_parts.next()?.parse().ok()?;
    let seconds: f64 = time_parts.next().unwrap_or("0").parse().ok()?;
    if hour > 23 || minute > 59 || !(0.0..61.0).contains(&seconds) {
        return None;
    }
    // Days from the civil date (Howard Hinnant's algorithm).
    let y = if month <= 2 { year - 1 } else { year };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    let secs = days * 86_400 + hour * 3600 + minute * 60 - offset_minutes * 60;
    Some(secs * 1000 + (seconds * 1000.0) as i64)
}

fn chapter_time(chapter: &Chapter) -> i64 {
    [
        &chapter.readable_at,
        &chapter.publish_at,
        &chapter.updated_at,
    ]
    .into_iter()
    .flatten()
    .find_map(|text| parse_timestamp(text))
    .unwrap_or(0)
}

/// Unix milliseconds now.
pub(crate) fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| u64::try_from(d.as_millis()).unwrap_or(u64::MAX))
}

// --- Follows ---------------------------------------------------------------

/// Reads the whole follow list and every reading status from MangaDex and
/// replaces the cached ones. Returns the followed series, newest first.
pub(crate) async fn refresh_follows(md: &MangaDex, library: &Library) -> SyncResult<Vec<Manga>> {
    let mut follows = Vec::new();
    let mut offset = 0;
    for _ in 0..MAX_FOLLOW_PAGES {
        let page = md.followed_manga(FOLLOW_PAGE, offset).await?;
        let more = page.has_more();
        offset = page.offset.saturating_add(page.items.len() as u32);
        follows.extend(page.items);
        if !more {
            break;
        }
    }
    let rows = follows
        .iter()
        .map(|manga| Ok((manga.id.clone(), serde_json::to_value(manga)?)))
        .collect::<Result<Vec<_>, serde_json::Error>>()?;
    library.online_replace_follows(&rows)?;

    let statuses = md.reading_statuses(None).await?;
    let statuses: BTreeMap<String, String> = statuses
        .into_iter()
        .map(|(id, status)| (id, status.as_api().to_owned()))
        .collect();
    library.online_replace_reading_statuses(&statuses)?;
    Ok(follows)
}

// --- Feed ------------------------------------------------------------------

/// What a feed refresh brought.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct FeedRefresh {
    /// Chapters never stored before, newest first.
    pub(crate) fresh: Vec<String>,
    /// True when this was the first refresh for the account; nothing in it
    /// is announced.
    pub(crate) first: bool,
}

/// Fetches new chapters of followed series since the last refresh (the last
/// two weeks the first time), stores them and forgets chapters older than a
/// month.
pub(crate) async fn refresh_feed(md: &MangaDex, library: &Library) -> SyncResult<FeedRefresh> {
    let now = now_ms();
    let last = library
        .online_state(STATE_LAST_REFRESH)?
        .and_then(|text| text.parse::<u64>().ok());
    let since = match last {
        Some(last) => last.saturating_sub(REFRESH_OVERLAP_MS),
        None => now.saturating_sub(FIRST_REFRESH_WINDOW_MS),
    };
    let mut query = FeedQuery {
        limit: Some(FEED_PAGE),
        order: FeedOrder::NewestFirst,
        published_since: Some(since),
        ..FeedQuery::default()
    };
    let mut items = Vec::new();
    for _ in 0..MAX_FEED_PAGES {
        let page = md.followed_feed(&query).await?;
        let more = page.has_more();
        query.offset = page.offset.saturating_add(page.items.len() as u32);
        for chapter in page.items {
            let Some(manga_id) = chapter.manga_id.clone() else {
                continue;
            };
            items.push(NewFeedItem {
                chapter_id: chapter.id.clone(),
                manga_id,
                published_at: chapter_time(&chapter),
                data: serde_json::to_value(&chapter)?,
            });
        }
        if !more {
            break;
        }
    }
    let fresh = library.online_store_feed(&items)?;
    library.online_prune_feed(i64::try_from(now.saturating_sub(FEED_KEEP_MS)).unwrap_or(0))?;
    library.online_set_state(STATE_LAST_REFRESH, Some(&now.to_string()))?;
    if last.is_none() {
        // The first refresh fills the feed with what is already out; none of
        // it is news.
        library.online_mark_notified(&fresh)?;
    }
    Ok(FeedRefresh {
        fresh,
        first: last.is_none(),
    })
}

/// A feed chapter as the updates screen shows it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FeedEntry {
    pub(crate) chapter: Chapter,
    pub(crate) read: bool,
    /// Arrived after the feed was last opened.
    pub(crate) new: bool,
}

/// New chapters of one series.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FeedGroup {
    pub(crate) manga_id: String,
    /// The cached series, `None` if it is not in the cache.
    pub(crate) manga: Option<Manga>,
    /// Newest first.
    pub(crate) chapters: Vec<FeedEntry>,
    pub(crate) latest_at: i64,
    pub(crate) unread: usize,
}

/// Groups feed chapters by series, newest series first, chapters newest
/// first. Within a series each chapter number keeps only the chapters in the
/// earliest language of the chain that has it, like the series page, so a
/// chapter out in Polish and English shows once, in Polish.
pub(crate) fn group_feed(
    items: Vec<FeedItem>,
    series: &HashMap<String, Manga>,
    read: &HashMap<String, bool>,
    prefs: &LanguagePrefs,
    seen_at: i64,
) -> Vec<FeedGroup> {
    let mut by_series: HashMap<String, Vec<(Chapter, i64, i64)>> = HashMap::new();
    for item in items {
        let Ok(chapter) = serde_json::from_value::<Chapter>(item.data) else {
            continue;
        };
        by_series.entry(item.manga_id).or_default().push((
            chapter,
            item.published_at,
            item.first_seen,
        ));
    }

    let mut groups: Vec<FeedGroup> = by_series
        .into_iter()
        .filter_map(|(manga_id, entries)| {
            let times: HashMap<String, (i64, i64)> = entries
                .iter()
                .map(|(chapter, published, seen)| (chapter.id.clone(), (*published, *seen)))
                .collect();
            let manga = series.get(&manga_id).cloned();
            let by_volume = manga
                .as_ref()
                .is_some_and(|m| m.chapter_numbers_reset_on_new_volume);
            let resolved = resolve_chapters(
                entries.into_iter().map(|(chapter, ..)| chapter).collect(),
                prefs,
                by_volume,
            );
            let mut chapters: Vec<FeedEntry> = resolved
                .chapters
                .into_iter()
                .map(|chapter| {
                    let (_, first_seen) = times.get(&chapter.id).copied().unwrap_or_default();
                    FeedEntry {
                        read: read.get(&chapter.id).copied().unwrap_or(false),
                        new: first_seen > seen_at,
                        chapter,
                    }
                })
                .collect();
            if chapters.is_empty() {
                return None;
            }
            chapters.sort_by_key(|entry| {
                std::cmp::Reverse(times.get(&entry.chapter.id).map_or(0, |t| t.0))
            });
            let latest_at = chapters
                .first()
                .and_then(|entry| times.get(&entry.chapter.id))
                .map_or(0, |t| t.0);
            let unread = chapters.iter().filter(|entry| !entry.read).count();
            Some(FeedGroup {
                manga_id,
                manga,
                chapters,
                latest_at,
                unread,
            })
        })
        .collect();
    groups.sort_by(|a, b| {
        b.latest_at
            .cmp(&a.latest_at)
            .then_with(|| a.manga_id.cmp(&b.manga_id))
    });
    groups
}

/// The stored feed, grouped, with read markers from the library.
pub(crate) fn feed_groups(
    library: &Library,
    prefs: &LanguagePrefs,
    limit: u32,
) -> SyncResult<Vec<FeedGroup>> {
    let items = library.online_feed(limit)?;
    let mut series = HashMap::new();
    let mut read = HashMap::new();
    let mut manga_ids: Vec<&str> = items.iter().map(|item| item.manga_id.as_str()).collect();
    manga_ids.sort_unstable();
    manga_ids.dedup();
    for id in manga_ids {
        if let Some(cached) = library.online_series(id)?
            && let Some(manga) = cached
                .data
                .and_then(|data| serde_json::from_value::<Manga>(data).ok())
        {
            series.insert(id.to_owned(), manga);
        }
        for marker in library.online_read_markers(id)? {
            read.insert(marker.chapter_id, marker.read);
        }
    }
    let seen_at = library
        .online_state(STATE_SEEN_AT)?
        .and_then(|text| text.parse().ok())
        .unwrap_or(i64::MAX);
    Ok(group_feed(items, &series, &read, prefs, seen_at))
}

// --- Read markers ----------------------------------------------------------

/// Sends unsent local read markers to MangaDex, then takes MangaDex's
/// markers for `manga_ids` into the library. A series whose push failed
/// keeps its pending markers, and those win over MangaDex's list until they
/// are sent. Returns how many markers were sent.
pub(crate) async fn sync_markers(
    md: &MangaDex,
    library: &Library,
    manga_ids: &[String],
) -> SyncResult<usize> {
    let sent = push_markers(md, library).await?;
    if manga_ids.is_empty() {
        return Ok(sent);
    }
    let remote = md.read_markers_for(manga_ids).await?;
    for id in manga_ids {
        let read = remote.get(id).map(Vec::as_slice).unwrap_or_default();
        library.online_merge_remote_markers(id, read)?;
    }
    Ok(sent)
}

/// Sends every pending marker, one request per series. Stops at the first
/// failure and returns it, after recording what already went through.
pub(crate) async fn push_markers(md: &MangaDex, library: &Library) -> SyncResult<usize> {
    let mut by_series: BTreeMap<String, (Vec<String>, Vec<String>)> = BTreeMap::new();
    for marker in library.online_pending_markers()? {
        let entry = by_series.entry(marker.manga_id).or_default();
        if marker.read {
            entry.0.push(marker.chapter_id);
        } else {
            entry.1.push(marker.chapter_id);
        }
    }
    let mut sent = 0;
    for (manga_id, (read, unread)) in by_series {
        md.set_read_markers(&manga_id, &read, &unread).await?;
        let done: Vec<(String, bool)> = read
            .into_iter()
            .map(|id| (id, true))
            .chain(unread.into_iter().map(|id| (id, false)))
            .collect();
        sent += done.len();
        library.online_markers_sent(&done)?;
    }
    Ok(sent)
}

// --- Chapters --------------------------------------------------------------

/// A series' chapters with the per series language switch applied: with a
/// single language set, only that language is listed and nothing falls
/// back; otherwise each chapter comes from the reader's language chain.
pub(crate) async fn series_chapters(
    md: &MangaDex,
    manga: &Manga,
    single_language: Option<&str>,
) -> SyncResult<LocalizedChapters> {
    let by_volume = manga.chapter_numbers_reset_on_new_volume;
    let Some(language) = single_language else {
        return Ok(md
            .chapters(&manga.id, ChapterListOptions { by_volume })
            .await?);
    };
    let prefs = LanguagePrefs::new([language], true)?;
    let mut query = FeedQuery {
        limit: Some(CHAPTER_PAGE),
        order: FeedOrder::ReadingOrder,
        languages: Some(vec![language.to_owned()]),
        ..FeedQuery::default()
    };
    let mut all = Vec::new();
    for _ in 0..MAX_CHAPTER_PAGES {
        let page = md.chapter_feed(&manga.id, &query).await?;
        let more = page.has_more();
        query.offset = page.offset.saturating_add(page.items.len() as u32);
        all.extend(page.items);
        if !more {
            break;
        }
    }
    Ok(resolve_chapters(all, &prefs, by_volume))
}

#[cfg(test)]
mod tests {
    use kirei_mangadex::{ClientConfig, ClientCredentials, Endpoints, LanguageOutcome, Secret};
    use serde_json::{Value, json};
    use wiremock::matchers::{body_json, method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    use super::*;

    const M1: &str = "0b1f2c3d-0000-4000-8000-000000000001";
    const M2: &str = "0b1f2c3d-0000-4000-8000-000000000002";

    fn cid(n: u32) -> String {
        format!("5c0a1b2c-0000-4000-8000-{n:012}")
    }

    fn chapter_json(id: &str, manga: &str, number: &str, language: &str, at: &str) -> Value {
        json!({
            "id": id,
            "type": "chapter",
            "attributes": {
                "volume": null,
                "chapter": number,
                "title": null,
                "translatedLanguage": language,
                "externalUrl": null,
                "publishAt": at,
                "readableAt": at,
                "createdAt": at,
                "updatedAt": at,
                "pages": 12,
                "version": 1
            },
            "relationships": [
                {
                    "id": "9a9a9a9a-0000-4000-8000-000000000091",
                    "type": "scanlation_group",
                    "attributes": { "name": "Nocne Tłumaczenia", "website": null, "official": false }
                },
                { "id": manga, "type": "manga" }
            ]
        })
    }

    fn manga_json(id: &str, title: &str) -> Value {
        json!({
            "id": id,
            "type": "manga",
            "attributes": {
                "title": { "en": title },
                "altTitles": [],
                "description": [],
                "originalLanguage": "ja",
                "status": "ongoing",
                "contentRating": "safe",
                "tags": [],
                "availableTranslatedLanguages": ["pl", "en"],
                "chapterNumbersResetOnNewVolume": false,
                "links": []
            },
            "relationships": []
        })
    }

    fn collection(data: Vec<Value>) -> ResponseTemplate {
        let total = data.len();
        ResponseTemplate::new(200).set_body_json(json!({
            "result": "ok",
            "response": "collection",
            "data": data,
            "limit": 100,
            "offset": 0,
            "total": total,
        }))
    }

    async fn signed_in(server: &MockServer) -> MangaDex {
        Mock::given(method("POST"))
            .and(path("/auth/token"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "access_token": "access",
                "refresh_token": "refresh",
                "expires_in": 900,
                "refresh_expires_in": 7_776_000,
                "token_type": "Bearer"
            })))
            .mount(server)
            .await;
        let mut config = ClientConfig::new("KireiManga/0.0.0-test");
        config.endpoints = Endpoints::local(&server.uri()).unwrap();
        config.cache = kirei_mangadex::CacheConfig::disabled();
        let md = MangaDex::new(config).unwrap();
        md.sign_in(
            ClientCredentials {
                client_id: "personal-client".into(),
                client_secret: Secret::new("secret"),
            },
            "reader",
            &Secret::new("password"),
        )
        .await
        .unwrap();
        md
    }

    fn library() -> (tempfile::TempDir, Library) {
        let dir = tempfile::tempdir().unwrap();
        let library = Library::open_in_memory(dir.path()).unwrap();
        (dir, library)
    }

    #[test]
    fn timestamps_parse_with_offsets_and_fractions() {
        assert_eq!(parse_timestamp("1970-01-01T00:00:00+00:00"), Some(0));
        assert_eq!(
            parse_timestamp("2026-01-10T12:00:00+00:00"),
            Some(1_768_046_400_000)
        );
        assert_eq!(
            parse_timestamp("2026-01-10T14:00:00+02:00"),
            parse_timestamp("2026-01-10T12:00:00Z")
        );
        assert_eq!(
            parse_timestamp("2026-01-10T12:00:00.250Z"),
            Some(1_768_046_400_250)
        );
        assert_eq!(parse_timestamp("yesterday"), None);
        assert_eq!(parse_timestamp("2026-13-01T00:00:00Z"), None);
    }

    #[tokio::test]
    async fn refreshing_follows_replaces_the_cache_and_statuses() {
        let server = MockServer::start().await;
        let md = signed_in(&server).await;
        let (_dir, library) = library();
        library.online_set_followed("stale", true).unwrap();
        Mock::given(method("GET"))
            .and(path("/user/follows/manga"))
            .respond_with(collection(vec![
                manga_json(M1, "Moonlit"),
                manga_json(M2, "Night Train"),
            ]))
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/manga/status"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "result": "ok",
                "statuses": { M1: "reading" }
            })))
            .mount(&server)
            .await;

        let follows = refresh_follows(&md, &library).await.unwrap();
        assert_eq!(follows.len(), 2);
        let cached: Vec<_> = library
            .online_followed()
            .unwrap()
            .into_iter()
            .map(|s| (s.manga_id, s.reading_status))
            .collect();
        assert_eq!(
            cached,
            vec![
                (M1.to_owned(), Some("reading".to_owned())),
                (M2.to_owned(), None)
            ]
        );
    }

    #[tokio::test]
    async fn the_first_feed_refresh_announces_nothing_and_later_ones_report_new_chapters() {
        let server = MockServer::start().await;
        let md = signed_in(&server).await;
        let (_dir, library) = library();
        library.online_set_followed(M1, true).unwrap();
        Mock::given(method("GET"))
            .and(path("/user/follows/manga/feed"))
            .and(query_param("order[readableAt]", "desc"))
            .respond_with(collection(vec![chapter_json(
                &cid(1),
                M1,
                "1",
                "pl",
                "2026-11-01T10:00:00+00:00",
            )]))
            .up_to_n_times(1)
            .mount(&server)
            .await;

        let first = refresh_feed(&md, &library).await.unwrap();
        assert!(first.first);
        assert_eq!(first.fresh, vec![cid(1)]);
        assert!(library.online_feed(10).unwrap()[0].notified);

        Mock::given(method("GET"))
            .and(path("/user/follows/manga/feed"))
            .respond_with(collection(vec![
                chapter_json(&cid(2), M1, "2", "pl", "2026-11-08T10:00:00+00:00"),
                chapter_json(&cid(1), M1, "1", "pl", "2026-11-01T10:00:00+00:00"),
            ]))
            .mount(&server)
            .await;
        let second = refresh_feed(&md, &library).await.unwrap();
        assert!(!second.first);
        assert_eq!(second.fresh, vec![cid(2)]);
        let feed = library.online_feed(10).unwrap();
        assert!(
            !feed[0].notified,
            "new chapters wait for their notification"
        );
    }

    fn feed_item(chapter: Value, manga: &str, published_at: i64, first_seen: i64) -> FeedItem {
        let parsed: Chapter = {
            // Go through the client's own parsing by round tripping a page.
            let wire =
                json!({ "result": "ok", "data": [chapter], "limit": 1, "offset": 0, "total": 1 });
            parse_chapters(wire).remove(0)
        };
        FeedItem {
            chapter_id: parsed.id.clone(),
            manga_id: manga.into(),
            data: serde_json::to_value(parsed).unwrap(),
            published_at,
            first_seen,
            notified: false,
        }
    }

    /// Chapters as the client parses them, without a server: the feed
    /// stores `Chapter` values, so build them from the client's own type.
    fn parse_chapters(wire: Value) -> Vec<Chapter> {
        wire["data"]
            .as_array()
            .unwrap()
            .iter()
            .map(|raw| {
                let attributes = &raw["attributes"];
                serde_json::from_value(json!({
                    "id": raw["id"],
                    "mangaId": raw["relationships"][1]["id"],
                    "title": attributes["title"],
                    "volume": attributes["volume"],
                    "chapter": attributes["chapter"],
                    "pages": attributes["pages"],
                    "language": attributes["translatedLanguage"],
                    "externalUrl": null,
                    "publishAt": attributes["publishAt"],
                    "readableAt": attributes["readableAt"],
                    "updatedAt": attributes["updatedAt"],
                    "groups": [{ "id": "g", "name": "Nocne Tłumaczenia", "website": null, "official": false }],
                    "uploader": null
                }))
                .unwrap()
            })
            .collect()
    }

    #[test]
    fn the_feed_groups_by_series_newest_first_and_prefers_the_chain() {
        let prefs = LanguagePrefs::default();
        let items = vec![
            feed_item(chapter_json(&cid(1), M1, "5", "en", "x"), M1, 100, 1),
            feed_item(chapter_json(&cid(2), M1, "5", "pl", "x"), M1, 90, 1),
            feed_item(chapter_json(&cid(3), M1, "6", "en", "x"), M1, 300, 50),
            feed_item(chapter_json(&cid(4), M2, "1", "pl", "x"), M2, 200, 1),
        ];
        let mut read = HashMap::new();
        read.insert(cid(2), true);
        let groups = group_feed(items, &HashMap::new(), &read, &prefs, 10);

        let order: Vec<_> = groups.iter().map(|g| g.manga_id.as_str()).collect();
        assert_eq!(order, [M1, M2], "the series with the newest chapter leads");
        let m1: Vec<_> = groups[0]
            .chapters
            .iter()
            .map(|e| {
                (
                    e.chapter.chapter.as_deref(),
                    e.chapter.language.as_str(),
                    e.read,
                    e.new,
                )
            })
            .collect();
        assert_eq!(
            m1,
            [
                (Some("6"), "en", false, true),
                (Some("5"), "pl", true, false)
            ],
            "chapter 5 shows once, in Polish; chapter 6 only exists in English"
        );
        assert_eq!(groups[0].unread, 1);
        assert_eq!(groups[0].latest_at, 300);
    }

    #[tokio::test]
    async fn markers_are_pushed_then_pulled_and_a_failed_push_stays_pending() {
        let server = MockServer::start().await;
        let md = signed_in(&server).await;
        let (_dir, library) = library();
        library
            .online_mark_chapters(M1, &[cid(1)], true, true)
            .unwrap();
        library
            .online_mark_chapters(M1, &[cid(9)], true, false)
            .unwrap();
        library
            .online_mark_chapters(M2, &[cid(5)], false, true)
            .unwrap();

        Mock::given(method("POST"))
            .and(path(format!("/manga/{M1}/read")))
            .and(body_json(
                json!({ "chapterIdsRead": [cid(1)], "chapterIdsUnread": [] }),
            ))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "result": "ok" })))
            .expect(1)
            .mount(&server)
            .await;
        Mock::given(method("POST"))
            .and(path(format!("/manga/{M2}/read")))
            .respond_with(ResponseTemplate::new(400).set_body_json(json!({
                "result": "error",
                "errors": [{ "status": 400, "title": "Bad Request", "detail": "nope" }]
            })))
            .mount(&server)
            .await;

        // M2's push fails: M1's went through and is recorded, M2 stays pending.
        assert!(sync_markers(&md, &library, &[M1.to_owned()]).await.is_err());
        let pending: Vec<_> = library
            .online_pending_markers()
            .unwrap()
            .into_iter()
            .map(|m| m.chapter_id)
            .collect();
        assert_eq!(pending, vec![cid(5)]);

        // Next time M2 goes through, and MangaDex's list for M1 comes back:
        // chapter 9 was marked unread on the website, chapter 3 read there.
        server.reset().await;
        Mock::given(method("POST"))
            .and(path(format!("/manga/{M2}/read")))
            .and(body_json(
                json!({ "chapterIdsRead": [], "chapterIdsUnread": [cid(5)] }),
            ))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "result": "ok" })))
            .expect(1)
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/manga/read"))
            .and(query_param("grouped", "true"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "result": "ok",
                "data": { M1: [cid(1), cid(3)] }
            })))
            .mount(&server)
            .await;

        let sent = sync_markers(&md, &library, &[M1.to_owned(), M2.to_owned()])
            .await
            .unwrap();
        assert_eq!(sent, 1);
        let m1: Vec<_> = library
            .online_read_markers(M1)
            .unwrap()
            .into_iter()
            .map(|m| (m.chapter_id, m.read))
            .collect();
        assert_eq!(m1, vec![(cid(1), true), (cid(3), true), (cid(9), false)]);
        assert!(library.online_pending_markers().unwrap().is_empty());
    }

    #[tokio::test]
    async fn the_language_switch_lists_one_language_without_fallback() {
        let server = MockServer::start().await;
        let md = signed_in(&server).await;
        let manga: Manga = {
            Mock::given(method("GET"))
                .and(path(format!("/manga/{M1}")))
                .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                    "result": "ok",
                    "data": manga_json(M1, "Moonlit")
                })))
                .mount(&server)
                .await;
            md.manga(M1).await.unwrap()
        };
        Mock::given(method("GET"))
            .and(path(format!("/manga/{M1}/feed")))
            .and(query_param("translatedLanguage[]", "en"))
            .respond_with(collection(vec![
                chapter_json(&cid(1), M1, "1", "en", "2026-01-01T00:00:00+00:00"),
                chapter_json(&cid(2), M1, "2", "en", "2026-01-02T00:00:00+00:00"),
            ]))
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path(format!("/manga/{M1}/feed")))
            .and(query_param("translatedLanguage[]", "pl"))
            .respond_with(collection(vec![
                chapter_json(&cid(3), M1, "1", "pl", "2026-01-03T00:00:00+00:00"),
                chapter_json(&cid(1), M1, "1", "en", "2026-01-01T00:00:00+00:00"),
                chapter_json(&cid(2), M1, "2", "en", "2026-01-02T00:00:00+00:00"),
            ]))
            .with_priority(1)
            .mount(&server)
            .await;

        let english = series_chapters(&md, &manga, Some("en")).await.unwrap();
        assert_eq!(english.outcome, LanguageOutcome::Preferred);
        assert_eq!(english.preferred, "en");
        assert_eq!(english.chapters.len(), 2);

        // Without the switch the chain fills gaps: chapter 1 in Polish,
        // chapter 2 from English.
        let filled = series_chapters(&md, &manga, None).await.unwrap();
        assert!(matches!(filled.outcome, LanguageOutcome::Mixed { .. }));
        let languages: Vec<_> = filled
            .chapters
            .iter()
            .map(|c| c.language.as_str())
            .collect();
        assert_eq!(languages, ["pl", "en"]);
    }
}
