//! Commands behind the online screens: account, search, series pages,
//! follows, the updates feed, reading MangaDex chapters and read markers.
//!
//! Failures come back as an [`OnlineError`] with a `kind`, so the renderer
//! can show offline, rate limit and expired session states instead of a
//! bare message.

use std::collections::HashMap;
use std::sync::Arc;

use kirei_core::{PageInfo, SourceKind};
use kirei_library::Library;
use kirei_mangadex::{
    Chapter, ClientCredentials, LocalizedChapters, Manga, MangaDexError, Page, ReadingStatus,
    SearchQuery, Secret, Tag,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

use crate::catalog::Catalog;
use crate::library::Library as Sources;

use super::source::OnlinePageSource;
use super::sync::{
    self, FeedGroup, STATE_LAST_REFRESH, STATE_SEEN_AT, SyncError, feed_groups, series_chapters,
};
use super::{AccountView, Online, STATE_USERNAME, Session};

/// Feed chapters listed at most.
const FEED_LIMIT: u32 = 300;
/// Series per search page, the API maximum.
const MAX_SEARCH_LIMIT: u32 = 100;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ErrorKind {
    /// MangaDex could not be reached.
    Offline,
    /// MangaDex asked to slow down; see `retry_after_secs`.
    RateLimited,
    /// MangaDex is refusing this network for a while.
    Blocked,
    /// The session ended; sign in again.
    SessionExpired,
    NotSignedIn,
    /// The sign in was refused (wrong password, unapproved client).
    SignIn,
    NotFound,
    /// The chapter is hosted outside MangaDex and cannot be read here.
    External,
    Invalid,
    Other,
}

/// A failed online command.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OnlineError {
    pub(crate) kind: ErrorKind,
    pub(crate) message: String,
    pub(crate) retry_after_secs: Option<u64>,
}

impl OnlineError {
    fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            retry_after_secs: None,
        }
    }

    fn other(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::Other, message)
    }
}

impl From<MangaDexError> for OnlineError {
    fn from(error: MangaDexError) -> Self {
        let kind = match &error {
            MangaDexError::Network(_) => ErrorKind::Offline,
            MangaDexError::RateLimited { .. } => ErrorKind::RateLimited,
            MangaDexError::Blocked => ErrorKind::Blocked,
            MangaDexError::SessionExpired => ErrorKind::SessionExpired,
            MangaDexError::NotSignedIn => ErrorKind::NotSignedIn,
            MangaDexError::SignIn(_) => ErrorKind::SignIn,
            MangaDexError::NotFound(_) => ErrorKind::NotFound,
            MangaDexError::InvalidInput(_) => ErrorKind::Invalid,
            _ => ErrorKind::Other,
        };
        let retry_after_secs = match &error {
            MangaDexError::RateLimited { retry_after } => Some(retry_after.as_secs().max(1)),
            _ => None,
        };
        Self {
            kind,
            message: error.to_string(),
            retry_after_secs,
        }
    }
}

impl From<SyncError> for OnlineError {
    fn from(error: SyncError) -> Self {
        match error {
            SyncError::MangaDex(error) => error.into(),
            SyncError::Library(message) => Self::other(message),
        }
    }
}

impl From<kirei_library::LibraryError> for OnlineError {
    fn from(error: kirei_library::LibraryError) -> Self {
        Self::other(error.to_string())
    }
}

type OnlineResult<T> = Result<T, OnlineError>;

fn library<R: Runtime>(app: &AppHandle<R>) -> OnlineResult<Arc<Library>> {
    app.state::<Catalog>().library().map_err(OnlineError::other)
}

/// A sync failure as a command error, with its effect on the network state
/// recorded.
fn tracked(online: &Online, error: SyncError) -> OnlineError {
    match error {
        SyncError::MangaDex(error) => {
            online.note(&error);
            error.into()
        }
        other => other.into(),
    }
}

fn require_signed_in(online: &Online) -> OnlineResult<()> {
    match online.session() {
        Session::SignedIn => Ok(()),
        Session::Expired => Err(OnlineError::new(
            ErrorKind::SessionExpired,
            "the MangaDex session has expired; sign in again",
        )),
        Session::SignedOut => Err(OnlineError::new(
            ErrorKind::NotSignedIn,
            "sign in to MangaDex first",
        )),
    }
}

// --- Account -----------------------------------------------------------------

#[tauri::command]
pub(crate) async fn online_account<R: Runtime>(app: AppHandle<R>) -> AccountView {
    app.state::<Online>().account()
}

/// What the sign in form sends. The password is used for one request and
/// dropped; the client secret goes to the keychain.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SignInForm {
    client_id: String,
    client_secret: String,
    username: String,
    password: String,
}

#[tauri::command]
pub(crate) async fn online_sign_in<R: Runtime>(
    app: AppHandle<R>,
    form: SignInForm,
) -> OnlineResult<AccountView> {
    let online = app.state::<Online>();
    let library = library(&app)?;
    let client = ClientCredentials {
        client_id: form.client_id.trim().to_owned(),
        client_secret: Secret::new(form.client_secret.trim()),
    };
    if client.client_id.is_empty() || client.client_secret.expose().is_empty() {
        return Err(OnlineError::new(
            ErrorKind::Invalid,
            "enter the client id and secret of your MangaDex API client",
        ));
    }
    let username = form.username.trim().to_owned();
    let password = Secret::new(form.password);
    online
        .track(
            online
                .client()
                .sign_in(client.clone(), &username, &password)
                .await,
        )
        .map_err(OnlineError::from)?;
    // The token sink already stored the session; the client goes next to it.
    online
        .credentials()
        .save_client(&client)
        .map_err(OnlineError::other)?;
    library.online_set_state(STATE_USERNAME, Some(&username))?;
    online.set_session(Session::SignedIn, Some(username));

    // Fill the follow list and the feed in the background.
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        super::refresh::run(&handle, super::refresh::Trigger::SignIn).await;
    });
    Ok(online.account())
}

#[tauri::command]
pub(crate) async fn online_sign_out<R: Runtime>(app: AppHandle<R>) -> OnlineResult<AccountView> {
    let online = app.state::<Online>();
    let library = library(&app)?;
    online.client().sign_out().await;
    online.client().clear_cache();
    let forgotten = online.credentials().forget();
    library.online_forget_account()?;
    online.set_session(Session::SignedOut, None);
    forgotten.map_err(OnlineError::other)?;
    Ok(online.account())
}

// --- Catalogue ---------------------------------------------------------------

/// Searches MangaDex. Ratings always come from the settings, never from the
/// renderer.
#[tauri::command]
pub(crate) async fn online_search<R: Runtime>(
    app: AppHandle<R>,
    query: SearchQuery,
) -> OnlineResult<Page<Manga>> {
    let online = app.state::<Online>();
    let query = SearchQuery {
        content_rating: None,
        limit: Some(query.limit.unwrap_or(30).clamp(1, MAX_SEARCH_LIMIT)),
        ..query
    };
    Ok(online.track(online.client().search(&query).await)?)
}

#[tauri::command]
pub(crate) async fn online_tags<R: Runtime>(app: AppHandle<R>) -> OnlineResult<Vec<Tag>> {
    let online = app.state::<Online>();
    Ok(online.track(online.client().tags().await)?)
}

/// A MangaDex series page: the series, the account's view of it and the
/// language switch.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SeriesView {
    manga: Manga,
    following: bool,
    reading_status: Option<ReadingStatus>,
    single_language: Option<String>,
    /// For tracking: the AniList id from the series links.
    anilist_id: Option<u64>,
    /// True when the series came from the offline cache.
    cached: bool,
}

#[tauri::command]
pub(crate) async fn online_series<R: Runtime>(
    app: AppHandle<R>,
    manga_id: String,
) -> OnlineResult<SeriesView> {
    let online = app.state::<Online>();
    let library = library(&app)?;
    let stored = library.online_series(&manga_id)?;
    let (manga, cached) = match online.track(online.client().manga(&manga_id).await) {
        Ok(manga) => (manga, false),
        Err(error) => {
            // Followed series stay readable from the cache while offline.
            let cached = stored
                .as_ref()
                .and_then(|s| s.data.clone())
                .and_then(|data| serde_json::from_value::<Manga>(data).ok());
            match cached {
                Some(manga) => (manga, true),
                None => return Err(error.into()),
            }
        }
    };
    let mut following = stored.as_ref().is_some_and(|s| s.followed);
    let mut reading_status = stored
        .as_ref()
        .and_then(|s| s.reading_status.as_deref())
        .and_then(parse_status);
    if !cached && online.session() == Session::SignedIn {
        // Fresh from MangaDex when it answers; the cache otherwise.
        if let Ok(value) = online.track(online.client().is_following(&manga_id).await) {
            following = value;
        }
        if let Ok(value) = online.track(online.client().reading_status(&manga_id).await) {
            reading_status = value;
        }
        if following {
            library.online_set_followed(&manga_id, true)?;
            library.online_save_series(
                &manga_id,
                &serde_json::to_value(&manga)
                    .map_err(|error| OnlineError::other(error.to_string()))?,
            )?;
        }
    }
    Ok(SeriesView {
        anilist_id: manga.anilist_id(),
        single_language: stored.and_then(|s| s.single_language),
        manga,
        following,
        reading_status,
        cached,
    })
}

fn parse_status(text: &str) -> Option<ReadingStatus> {
    serde_json::from_value(serde_json::Value::String(match text {
        "on_hold" => "onHold".to_owned(),
        "plan_to_read" => "planToRead".to_owned(),
        "re_reading" => "reReading".to_owned(),
        other => other.to_owned(),
    }))
    .ok()
}

/// A chapter's local state.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkerView {
    read: bool,
    page: u32,
    pending: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChaptersView {
    #[serde(flatten)]
    chapters: LocalizedChapters,
    single_language: Option<String>,
    /// Read markers and resume pages by chapter id.
    markers: HashMap<String, MarkerView>,
}

fn marker_map(library: &Library, manga_id: &str) -> OnlineResult<HashMap<String, MarkerView>> {
    Ok(library
        .online_read_markers(manga_id)?
        .into_iter()
        .map(|marker| {
            (
                marker.chapter_id,
                MarkerView {
                    read: marker.read,
                    page: marker.page,
                    pending: marker.pending,
                },
            )
        })
        .collect())
}

/// The chapters of a series in the reader's languages (or the series'
/// single language), with read markers. Signed in, MangaDex's markers for
/// the series are synced first, both ways.
#[tauri::command]
pub(crate) async fn online_chapters<R: Runtime>(
    app: AppHandle<R>,
    manga_id: String,
) -> OnlineResult<ChaptersView> {
    let online = app.state::<Online>();
    let library = library(&app)?;
    let manga = online.track(online.client().manga(&manga_id).await)?;
    let single = library
        .online_series(&manga_id)?
        .and_then(|s| s.single_language);
    let chapters = series_chapters(online.client(), &manga, single.as_deref())
        .await
        .map_err(|error| tracked(&online, error))?;
    if online.session() == Session::SignedIn {
        // Best effort: the list shows with local markers if this fails.
        let synced =
            sync::sync_markers(online.client(), &library, std::slice::from_ref(&manga_id)).await;
        if let Err(SyncError::MangaDex(error)) = synced {
            online.note(&error);
        }
    }
    Ok(ChaptersView {
        markers: marker_map(&library, &manga_id)?,
        chapters,
        single_language: single,
    })
}

/// Sets the per series language switch: one language only, or `None` to
/// fill each chapter from the language chain.
#[tauri::command]
pub(crate) async fn online_set_series_language<R: Runtime>(
    app: AppHandle<R>,
    manga_id: String,
    language: Option<String>,
) -> OnlineResult<()> {
    if let Some(code) = &language
        && !kirei_core::is_language_code(code)
    {
        return Err(OnlineError::new(
            ErrorKind::Invalid,
            format!("`{code}` is not a MangaDex language code"),
        ));
    }
    let library = library(&app)?;
    library.online_set_single_language(&manga_id, language.as_deref())?;
    Ok(())
}

// --- Follows -----------------------------------------------------------------

#[tauri::command]
pub(crate) async fn online_follow<R: Runtime>(
    app: AppHandle<R>,
    manga_id: String,
    follow: bool,
) -> OnlineResult<()> {
    let online = app.state::<Online>();
    require_signed_in(&online)?;
    let library = library(&app)?;
    let md = online.client();
    if follow {
        online.track(md.follow(&manga_id).await)?;
        if let Ok(manga) = online.track(md.manga(&manga_id).await) {
            library.online_save_series(
                &manga_id,
                &serde_json::to_value(&manga).map_err(|e| OnlineError::other(e.to_string()))?,
            )?;
        }
    } else {
        online.track(md.unfollow(&manga_id).await)?;
    }
    library.online_set_followed(&manga_id, follow)?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn online_set_reading_status<R: Runtime>(
    app: AppHandle<R>,
    manga_id: String,
    status: Option<ReadingStatus>,
) -> OnlineResult<()> {
    let online = app.state::<Online>();
    require_signed_in(&online)?;
    online.track(online.client().set_reading_status(&manga_id, status).await)?;
    library(&app)?.online_set_reading_status(&manga_id, status.map(ReadingStatus::as_api))?;
    Ok(())
}

/// A followed series for the Following tab.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FollowView {
    manga_id: String,
    manga: Option<Manga>,
    reading_status: Option<ReadingStatus>,
}

/// The cached follow list, newest first. Works offline.
#[tauri::command]
pub(crate) async fn online_follows<R: Runtime>(app: AppHandle<R>) -> OnlineResult<Vec<FollowView>> {
    let library = library(&app)?;
    Ok(library
        .online_followed()?
        .into_iter()
        .map(|series| FollowView {
            manga: series
                .data
                .and_then(|data| serde_json::from_value(data).ok()),
            reading_status: series.reading_status.as_deref().and_then(parse_status),
            manga_id: series.manga_id,
        })
        .collect())
}

// --- Feed --------------------------------------------------------------------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FeedView {
    groups: Vec<FeedGroup>,
    /// Unix milliseconds of the last successful refresh.
    last_refresh: Option<u64>,
}

pub(crate) fn feed_view(online: &Online, library: &Library) -> OnlineResult<FeedView> {
    Ok(FeedView {
        groups: feed_groups(library, &online.client().languages(), FEED_LIMIT)?,
        last_refresh: library
            .online_state(STATE_LAST_REFRESH)?
            .and_then(|text| text.parse().ok()),
    })
}

/// The stored updates feed, grouped by series. Works offline.
#[tauri::command]
pub(crate) async fn online_feed<R: Runtime>(app: AppHandle<R>) -> OnlineResult<FeedView> {
    let online = app.state::<Online>();
    let library = library(&app)?;
    feed_view(&online, &library)
}

/// Refreshes follows, the feed and read markers now, then returns the feed.
/// New chapters it finds are not announced: the user is looking at them.
#[tauri::command]
pub(crate) async fn online_refresh_feed<R: Runtime>(app: AppHandle<R>) -> OnlineResult<FeedView> {
    let online = app.state::<Online>();
    require_signed_in(&online)?;
    super::refresh::refresh(&app, false).await?;
    let library = library(&app)?;
    feed_view(&online, &library)
}

/// Remembers that the feed was looked at: chapters before now lose their
/// "new" badge next time.
#[tauri::command]
pub(crate) async fn online_mark_feed_seen<R: Runtime>(app: AppHandle<R>) -> OnlineResult<()> {
    library(&app)?.online_set_state(STATE_SEEN_AT, Some(&sync::now_ms().to_string()))?;
    Ok(())
}

// --- Reading -----------------------------------------------------------------

/// A MangaDex chapter opened in the reader.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OpenedChapter {
    /// The page source id for `kirei-page` URLs and the reader commands.
    id: u64,
    kind: SourceKind,
    pages: Vec<PageInfo>,
    chapter: Chapter,
    manga: Manga,
    /// Page to resume on (0 based).
    start_page: u32,
    /// The next chapter in the series' list, for the end card.
    next: Option<Chapter>,
    data_saver: bool,
}

/// The chapter after `current` in a resolved list, skipping other groups'
/// versions of the same number.
pub(crate) fn next_chapter(chapters: &[Chapter], current: &str) -> Option<Chapter> {
    let at = chapters.iter().position(|chapter| chapter.id == current)?;
    let number = chapters[at].chapter.clone();
    chapters[at + 1..]
        .iter()
        .find(|chapter| chapter.is_readable() && (number.is_none() || chapter.chapter != number))
        .cloned()
}

/// Opens a MangaDex chapter for the reader: its credits, the series, the
/// page list from MangaDex@Home and where reading stopped. Pages then load
/// through `kirei-page` like any archive.
#[tauri::command]
pub(crate) async fn online_open_chapter<R: Runtime>(
    app: AppHandle<R>,
    manga_id: String,
    chapter_id: String,
) -> OnlineResult<OpenedChapter> {
    let online = app.state::<Online>();
    let library = library(&app)?;
    let md = online.client();
    let chapter = online.track(md.chapter(&chapter_id).await)?;
    if chapter.external_url.is_some() {
        return Err(OnlineError::new(
            ErrorKind::External,
            "this chapter is hosted outside MangaDex; open it on MangaDex to read it",
        ));
    }
    let manga = online.track(md.manga(&manga_id).await)?;
    let source =
        online.track(OnlinePageSource::open(md, &chapter_id, online.data_saver()).await)?;
    if source_is_empty(&source) {
        return Err(OnlineError::new(
            ErrorKind::NotFound,
            "this chapter has no pages",
        ));
    }
    let single = library
        .online_series(&manga_id)?
        .and_then(|s| s.single_language);
    // The list is cached by the client, so this is usually free.
    let next = series_chapters(md, &manga, single.as_deref())
        .await
        .ok()
        .and_then(|list| next_chapter(&list.chapters, &chapter_id));
    let start_page = library
        .online_read_markers(&manga_id)?
        .into_iter()
        .find(|marker| marker.chapter_id == chapter_id)
        .filter(|marker| !marker.read)
        .map_or(0, |marker| marker.page);

    let data_saver = online.data_saver();
    let pages = kirei_archive::PageSource::pages(&source).to_vec();
    let id = app.state::<Sources>().register(Arc::new(source));
    Ok(OpenedChapter {
        id,
        kind: SourceKind::Online,
        start_page: start_page.min(pages.len().saturating_sub(1) as u32),
        pages,
        chapter,
        manga,
        next,
        data_saver,
    })
}

fn source_is_empty(source: &OnlinePageSource) -> bool {
    kirei_archive::PageSource::is_empty(source)
}

/// Records where reading stopped; `finished` marks the chapter read here and
/// on MangaDex (sent at once when signed in, else kept for later).
#[tauri::command]
pub(crate) async fn online_record_progress<R: Runtime>(
    app: AppHandle<R>,
    manga_id: String,
    chapter_id: String,
    page: u32,
    finished: bool,
) -> OnlineResult<()> {
    let library = library(&app)?;
    library.online_record_page(&manga_id, &chapter_id, page)?;
    if finished {
        let already = library
            .online_read_markers(&manga_id)?
            .into_iter()
            .any(|marker| marker.chapter_id == chapter_id && marker.read);
        if !already {
            library.online_mark_chapters(&manga_id, &[chapter_id], true, true)?;
            push_soon(&app);
        }
    }
    Ok(())
}

/// Marks chapters read or unread here and on MangaDex.
#[tauri::command]
pub(crate) async fn online_mark_read<R: Runtime>(
    app: AppHandle<R>,
    manga_id: String,
    chapter_ids: Vec<String>,
    read: bool,
) -> OnlineResult<HashMap<String, MarkerView>> {
    let library = library(&app)?;
    library.online_mark_chapters(&manga_id, &chapter_ids, read, true)?;
    push_soon(&app);
    marker_map(&library, &manga_id)
}

/// Sends pending read markers in the background when signed in. A failure
/// keeps them pending for the next refresh.
fn push_soon<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let online = app.state::<Online>();
        if online.session() != Session::SignedIn {
            return;
        }
        let Ok(library) = library(&app) else {
            return;
        };
        if let Err(SyncError::MangaDex(error)) = sync::push_markers(online.client(), &library).await
        {
            online.note(&error);
        }
    });
}

/// MangaDex pages the app may open in the browser, built from an id so the
/// renderer cannot launch arbitrary URLs.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind", content = "id")]
pub(crate) enum MangaDexPage {
    Home,
    Title(String),
    Chapter(String),
    Group(String),
    /// Where personal API clients are created.
    ApiClients,
}

impl MangaDexPage {
    fn url(&self) -> OnlineResult<String> {
        let checked = |id: &str| {
            if id.len() == 36 && id.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-') {
                Ok(id.to_owned())
            } else {
                Err(OnlineError::new(ErrorKind::Invalid, "not a MangaDex id"))
            }
        };
        Ok(match self {
            Self::Home => "https://mangadex.org".to_owned(),
            Self::Title(id) => format!("https://mangadex.org/title/{}", checked(id)?),
            Self::Chapter(id) => format!("https://mangadex.org/chapter/{}", checked(id)?),
            Self::Group(id) => format!("https://mangadex.org/group/{}", checked(id)?),
            Self::ApiClients => "https://mangadex.org/settings".to_owned(),
        })
    }
}

#[tauri::command]
pub(crate) async fn online_open_mangadex(page: MangaDexPage) -> OnlineResult<()> {
    crate::settings::spawn_open(page.url()?.into())
        .await
        .map_err(OnlineError::other)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chapter(id: &str, number: Option<&str>) -> Chapter {
        serde_json::from_value(serde_json::json!({
            "id": id,
            "mangaId": null,
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

    #[test]
    fn the_next_chapter_skips_other_versions_of_the_same_number() {
        let list = vec![
            chapter("a", Some("1")),
            chapter("b", Some("1")),
            chapter("c", Some("2")),
            chapter("d", None),
        ];
        assert_eq!(next_chapter(&list, "a").unwrap().id, "c");
        assert_eq!(next_chapter(&list, "c").unwrap().id, "d");
        assert!(next_chapter(&list, "d").is_none());
        assert!(next_chapter(&list, "zz").is_none());
    }

    #[test]
    fn errors_carry_a_kind_and_the_wait() {
        let error = OnlineError::from(MangaDexError::RateLimited {
            retry_after: std::time::Duration::from_millis(1500),
        });
        assert_eq!(error.kind, ErrorKind::RateLimited);
        assert_eq!(error.retry_after_secs, Some(1));
        let json = serde_json::to_value(OnlineError::from(MangaDexError::SessionExpired)).unwrap();
        assert_eq!(json["kind"], "sessionExpired");
    }

    #[test]
    fn reading_statuses_parse_from_their_api_names() {
        assert_eq!(parse_status("on_hold"), Some(ReadingStatus::OnHold));
        assert_eq!(parse_status("reading"), Some(ReadingStatus::Reading));
        assert_eq!(parse_status("nonsense"), None);
    }

    #[test]
    fn mangadex_pages_only_take_ids() {
        let page: MangaDexPage = serde_json::from_value(
            serde_json::json!({ "kind": "title", "id": "0b1f2c3d-0000-4000-8000-000000000001" }),
        )
        .unwrap();
        assert_eq!(
            page.url().unwrap(),
            "https://mangadex.org/title/0b1f2c3d-0000-4000-8000-000000000001"
        );
        let bad = MangaDexPage::Title("evil.test/../x".into());
        assert!(bad.url().is_err());
    }
}
