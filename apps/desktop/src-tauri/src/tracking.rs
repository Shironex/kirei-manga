//! AniList tracking: the account (sign in through the browser, token in the
//! keychain), series links, and the worker that delivers queued progress.
//!
//! Finishing a chapter of a linked series queues its progress, debounced so
//! a run of chapters becomes one request. The worker sends due updates under
//! the conflict rules in `kirei_anilist::sync` and records what AniList said
//! on the link, so the series page shows remote progress without asking.
//! Updates that fail for a transient reason (offline, rate limited, AniList
//! down) stay queued and retry with backoff, across restarts. The token never
//! crosses IPC and is never logged. See `docs/tracking.md`.

use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use kirei_anilist::sync::{chapter_position, chapters_read, deliver};
use kirei_anilist::{
    AccessToken, AniList, ClientConfig, ConflictPolicy, Delivery, Endpoints, ListEntry, ListStatus,
    PendingUpdate, SearchPage, SignInListener, Viewer, authorize_url, default_user_agent,
};
use kirei_core::{AppSettings, TrackingConflict};
use kirei_library::{
    Library, LinkSource, QueueSummary, QueuedUpdate, RemoteState, TrackerLink, UpdateRequest,
    mangadex_series_key,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio::sync::{Notify, oneshot};

use crate::catalog::Catalog;
use crate::keychain::{Keychain, SecretStore};

/// Sent to every window when the account, a link or the queue changes.
pub(crate) const TRACKING_CHANGED_EVENT: &str = "tracking:changed";

/// Keychain account of the AniList token.
const TOKEN_ACCOUNT: &str = "anilist.token";

/// The port of the redirect URL registered on AniList
/// (`http://127.0.0.1:47615/anilist/callback`). A build may override it with
/// `KIREI_ANILIST_REDIRECT_PORT` when the client was registered with another.
const DEFAULT_REDIRECT_PORT: u16 = 47615;

/// How long the app waits for the browser to come back.
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(5 * 60);

/// Progress of a finished chapter waits this long, so reading several
/// chapters in a row sends one update.
const FINISH_DEBOUNCE_MS: i64 = 15_000;

/// The worker looks at the queue at least this often.
const IDLE_WAKE: Duration = Duration::from_secs(60);

/// Updates delivered per worker pass.
const BATCH: usize = 10;

/// The AniList client id this build was made with (`KIREI_ANILIST_CLIENT_ID`
/// at build time). Public, not a secret; see docs/tracking.md.
fn client_id() -> Option<&'static str> {
    option_env!("KIREI_ANILIST_CLIENT_ID")
        .map(str::trim)
        .filter(|id| !id.is_empty())
}

fn redirect_port() -> u16 {
    option_env!("KIREI_ANILIST_REDIRECT_PORT")
        .and_then(|port| port.trim().parse().ok())
        .unwrap_or(DEFAULT_REDIRECT_PORT)
}

fn policy(settings: &AppSettings) -> ConflictPolicy {
    match settings.tracking_conflict {
        TrackingConflict::Higher => ConflictPolicy::Higher,
        TrackingConflict::Local => ConflictPolicy::Local,
    }
}

/// Managed state. Clones share everything.
#[derive(Clone)]
pub(crate) struct Tracking(Arc<Inner>);

struct Inner {
    client: AniList,
    secrets: Arc<dyn SecretStore>,
    viewer: Mutex<Option<Viewer>>,
    token: Mutex<Option<AccessToken>>,
    signing_in: Mutex<Option<oneshot::Sender<()>>>,
    wake: Notify,
}

/// What the Settings screen shows about the account.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AccountStatus {
    /// This build has an AniList client id.
    configured: bool,
    signed_in: bool,
    viewer: Option<Viewer>,
    /// When the token stops working, Unix milliseconds.
    expires_at: Option<i64>,
    /// A sign in is waiting for the browser.
    signing_in: bool,
    /// The redirect URL the AniList client must be registered with.
    redirect_uri: String,
    /// Requests per minute the client allows itself now.
    rate_limit: u32,
}

/// A series, local or from MangaDex.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "kind", content = "id", rename_all = "camelCase")]
pub(crate) enum SeriesRef {
    Local(i64),
    Mangadex(String),
}

/// Everything the series page shows about tracking.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SeriesTracking {
    series_key: String,
    link: Option<TrackerLink>,
    /// Chapters read here; `None` for series the library does not hold.
    local_progress: Option<i64>,
    queued: Option<QueuedUpdate>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum LinkOrigin {
    Manual,
    Mangadex,
}

/// Runs `work` against the library on the blocking pool.
async fn blocking<T, F>(library: &Arc<Library>, work: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&Library) -> kirei_library::Result<T> + Send + 'static,
{
    let library = Arc::clone(library);
    tokio::task::spawn_blocking(move || work(&library).map_err(|e| e.to_string()))
        .await
        .map_err(|error| error.to_string())?
}

fn remote_state(entry: Option<&ListEntry>, total: Option<i64>, agreed: bool) -> RemoteState {
    RemoteState {
        progress: entry.map(|e| e.progress),
        status: entry.and_then(|e| e.status).map(|s| s.as_str().to_owned()),
        score: entry.map(|e| e.score),
        total_chapters: total,
        agreed,
    }
}

/// What one worker pass did.
#[derive(Debug, Default, PartialEq, Eq)]
pub(crate) struct Pass {
    pub(crate) delivered: usize,
    pub(crate) changed: bool,
    /// The sign in was refused; the account is signed out.
    pub(crate) signed_out: bool,
}

impl Tracking {
    pub(crate) fn new() -> Self {
        let config = ClientConfig::new(default_user_agent(env!("CARGO_PKG_VERSION")));
        Self::with(config, Arc::new(Keychain))
    }

    pub(crate) fn with(config: ClientConfig, secrets: Arc<dyn SecretStore>) -> Self {
        let client = match AniList::new(config.clone()) {
            Ok(client) => client,
            // Building a client only fails without TLS; fall back to the
            // defaults so the rest of the app still starts.
            Err(error) => {
                eprintln!("KireiManga AniList client unavailable: {error}");
                AniList::new(ClientConfig::new(config.user_agent))
                    .unwrap_or_else(|_| unreachable!("the default client builds"))
            }
        };
        Self(Arc::new(Inner {
            client,
            secrets,
            viewer: Mutex::new(None),
            token: Mutex::new(None),
            signing_in: Mutex::new(None),
            wake: Notify::new(),
        }))
    }

    /// Lets the worker look at the queue now.
    pub(crate) fn wake(&self) {
        self.0.wake.notify_one();
    }

    /// Puts the stored token back in use. An expired one is dropped.
    pub(crate) async fn restore(&self) {
        let secrets = Arc::clone(&self.0.secrets);
        let stored = tokio::task::spawn_blocking(move || secrets.get(TOKEN_ACCOUNT)).await;
        let stored = match stored {
            Ok(Ok(stored)) => stored,
            Ok(Err(error)) => {
                eprintln!("KireiManga cannot read the AniList sign in: {error}");
                None
            }
            Err(_) => None,
        };
        let token = stored.and_then(|json| serde_json::from_str::<AccessToken>(&json).ok());
        match token {
            Some(token) if !token.is_expired() => self.use_token(Some(token)),
            Some(_) => {
                let _ = self.forget_token().await;
            }
            None => {}
        }
    }

    fn use_token(&self, token: Option<AccessToken>) {
        self.0.client.set_token(token.clone());
        *self.0.token.lock().unwrap_or_else(PoisonError::into_inner) = token;
    }

    fn token(&self) -> Option<AccessToken> {
        self.0
            .token
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    fn set_viewer(&self, viewer: Option<Viewer>) {
        *self.0.viewer.lock().unwrap_or_else(PoisonError::into_inner) = viewer;
    }

    fn viewer(&self) -> Option<Viewer> {
        self.0
            .viewer
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    /// Signs out here: no token in use or in the keychain.
    async fn forget_token(&self) -> Result<(), String> {
        self.use_token(None);
        self.set_viewer(None);
        let secrets = Arc::clone(&self.0.secrets);
        tokio::task::spawn_blocking(move || secrets.delete(TOKEN_ACCOUNT))
            .await
            .map_err(|error| error.to_string())?
    }

    /// Checks a new token against AniList, then keeps it.
    pub(crate) async fn accept_token(&self, token: AccessToken) -> Result<Viewer, String> {
        let previous = self.token();
        self.use_token(Some(token.clone()));
        let viewer = match self.0.client.viewer().await {
            Ok(viewer) => viewer,
            Err(error) => {
                // A token that does not work never replaces one that does.
                self.use_token(previous);
                return Err(error.to_string());
            }
        };
        let json = serde_json::to_string(&token).map_err(|error| error.to_string())?;
        let secrets = Arc::clone(&self.0.secrets);
        tokio::task::spawn_blocking(move || secrets.set(TOKEN_ACCOUNT, &json))
            .await
            .map_err(|error| error.to_string())??;
        self.set_viewer(Some(viewer.clone()));
        Ok(viewer)
    }

    /// The account as the Settings screen shows it. Asks AniList who is
    /// signed in when that is not known yet; a refused token signs out.
    pub(crate) async fn status(&self) -> AccountStatus {
        if self.0.client.is_signed_in() && self.viewer().is_none() {
            match self.0.client.viewer().await {
                Ok(viewer) => self.set_viewer(Some(viewer)),
                Err(error) if error.needs_sign_in() => {
                    let _ = self.forget_token().await;
                }
                // Offline: still signed in, the name shows up later.
                Err(_) => {}
            }
        }
        let signed_in = self.0.client.is_signed_in();
        // Read every lock before the await below, so no guard is held there.
        let signing_in = self
            .0
            .signing_in
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .is_some();
        let viewer = if signed_in { self.viewer() } else { None };
        let expires_at = if signed_in {
            self.token().map(|t| t.expires_at)
        } else {
            None
        };
        let rate_limit = self.0.client.rate_limit().await;
        AccountStatus {
            configured: client_id().is_some(),
            signed_in,
            viewer,
            expires_at,
            signing_in,
            redirect_uri: kirei_anilist::redirect_uri(redirect_port()),
            rate_limit,
        }
    }

    /// One worker pass: delivers the updates that are due. Returns how long
    /// to sleep before the next pass (woken earlier by [`Tracking::wake`]).
    pub(crate) async fn pass(&self, library: &Arc<Library>) -> Result<(Pass, Duration), String> {
        let settings = blocking(library, Library::settings).await?;
        let mut pass = Pass::default();
        if !settings.tracking_enabled || !self.0.client.is_signed_in() {
            return Ok((pass, IDLE_WAKE));
        }
        let policy = policy(&settings);
        let now = kirei_anilist_now();
        let due = blocking(library, move |l| l.due_updates(now, BATCH)).await?;
        for queued in due {
            let pending = PendingUpdate {
                media_id: queued.media_id,
                progress: queued.progress,
                status: queued.status.as_deref().and_then(ListStatus::parse),
                score: queued.score,
                synced: queued.synced_progress,
                attempts: queued.attempts,
            };
            let delivery = deliver(&self.0.client, &pending, policy).await;
            let (id, revision, media_id) = (queued.id, queued.revision, queued.media_id);
            pass.changed = true;
            match delivery {
                Delivery::Sent { entry, total } => {
                    let state = remote_state(Some(&entry), total, true);
                    blocking(library, move |l| {
                        l.record_remote(media_id, &state)?;
                        l.complete_update(id, revision)
                    })
                    .await?;
                    pass.delivered += 1;
                }
                Delivery::InSync { entry, total } => {
                    let agreed = entry.is_some() && pending.progress.is_some();
                    let state = remote_state(entry.as_ref(), total, agreed);
                    blocking(library, move |l| {
                        l.record_remote(media_id, &state)?;
                        l.complete_update(id, revision)
                    })
                    .await?;
                }
                Delivery::RemoteAhead { entry, total } => {
                    let state = remote_state(Some(&entry), total, false);
                    blocking(library, move |l| {
                        l.record_remote(media_id, &state)?;
                        l.complete_update(id, revision)
                    })
                    .await?;
                }
                Delivery::Retry { error, after } => {
                    let delay = i64::try_from(after.as_millis()).unwrap_or(i64::MAX);
                    blocking(library, move |l| {
                        l.retry_update(id, revision, &error, delay)
                    })
                    .await?;
                }
                Delivery::Failed { error } => {
                    blocking(library, move |l| l.fail_update(id, revision, &error)).await?;
                }
                Delivery::NeedsSignIn { error } => {
                    blocking(library, move |l| l.block_updates(&error)).await?;
                    self.forget_token().await?;
                    pass.signed_out = true;
                    break;
                }
            }
        }
        let next = blocking(library, Library::next_update_at).await?;
        let wait = match next {
            Some(at) => {
                let ms = u64::try_from(at - kirei_anilist_now()).unwrap_or(0);
                Duration::from_millis(ms).min(IDLE_WAKE)
            }
            None => IDLE_WAKE,
        };
        Ok((pass, wait))
    }
}

fn kirei_anilist_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_millis()).unwrap_or(i64::MAX))
}

/// Starts the worker: restores the sign in, then delivers queued updates for
/// as long as the app runs.
pub(crate) fn start<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let tracking = app.state::<Tracking>().inner().clone();
        tracking.restore().await;
        let _ = app.emit(TRACKING_CHANGED_EVENT, ());
        loop {
            let wait = match app.state::<Catalog>().library() {
                Ok(library) => match tracking.pass(&library).await {
                    Ok((pass, wait)) => {
                        if pass.changed || pass.signed_out {
                            let _ = app.emit(TRACKING_CHANGED_EVENT, ());
                        }
                        wait
                    }
                    Err(error) => {
                        eprintln!("KireiManga tracking: {error}");
                        IDLE_WAKE
                    }
                },
                // No library, nothing to track.
                Err(_) => IDLE_WAKE,
            };
            tokio::select! {
                () = tracking.0.wake.notified() => {}
                () = tokio::time::sleep(wait) => {}
            }
        }
    });
}

/// Called after a chapter's last page was recorded: queues its progress when
/// tracking and auto update are on and the series is linked.
pub(crate) fn chapter_finished<R: Runtime>(app: &AppHandle<R>, chapter_id: i64) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let Ok(library) = app.state::<Catalog>().library() else {
            return;
        };
        match queue_finished_chapter(&library, chapter_id).await {
            Ok(true) => {
                app.state::<Tracking>().wake();
                let _ = app.emit(TRACKING_CHANGED_EVENT, ());
            }
            Ok(false) => {}
            Err(error) => eprintln!("KireiManga tracking: {error}"),
        }
    });
}

/// Queues the progress a finished chapter stands for. `false` when nothing
/// was queued (tracking off, auto update off, series not linked).
pub(crate) async fn queue_finished_chapter(
    library: &Arc<Library>,
    chapter_id: i64,
) -> Result<bool, String> {
    blocking(library, move |l| {
        let settings = l.settings()?;
        if !settings.tracking_enabled || !settings.tracking_auto_update {
            return Ok(false);
        }
        let Some(series_id) = l.chapter_series(chapter_id)? else {
            return Ok(false);
        };
        let Some(link) = l.tracker_link(&l.series_key(series_id)?)? else {
            return Ok(false);
        };
        let Some(detail) = l.series_detail(series_id)? else {
            return Ok(false);
        };
        let Some((index, chapter)) = detail
            .chapters
            .iter()
            .enumerate()
            .find(|(_, c)| c.id == chapter_id)
        else {
            return Ok(false);
        };
        let progress = chapter_position(chapter.number, index);
        l.enqueue_update(
            link.media_id,
            &UpdateRequest {
                progress: Some(progress),
                ..Default::default()
            },
            FINISH_DEBOUNCE_MS,
        )?;
        Ok(true)
    })
    .await
}

fn key_of(library: &Library, series: &SeriesRef) -> kirei_library::Result<String> {
    match series {
        SeriesRef::Local(id) => library.series_key(*id),
        SeriesRef::Mangadex(id) => {
            let id = id.trim();
            if id.is_empty() || !id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
                return Err(kirei_library::LibraryError::InvalidInput(
                    "not a MangaDex series id".into(),
                ));
            }
            Ok(mangadex_series_key(id))
        }
    }
}

/// Chapters read here, for a local series.
fn local_progress(library: &Library, series: &SeriesRef) -> kirei_library::Result<Option<i64>> {
    let SeriesRef::Local(id) = series else {
        return Ok(None);
    };
    Ok(library.series_detail(*id)?.map(|detail| {
        chapters_read(
            detail
                .chapters
                .iter()
                .map(|c| (c.number, c.progress.as_ref().is_some_and(|p| p.completed))),
        )
    }))
}

fn series_tracking(library: &Library, series: &SeriesRef) -> kirei_library::Result<SeriesTracking> {
    let series_key = key_of(library, series)?;
    let link = library.tracker_link(&series_key)?;
    let queued = match &link {
        Some(link) => library.queued_update(link.media_id)?,
        None => None,
    };
    Ok(SeriesTracking {
        series_key,
        link,
        local_progress: local_progress(library, series)?,
        queued,
    })
}

/// Queues a reconcile of a linked series: its local progress (if any) under
/// the conflict rules, or just a read of the AniList entry.
fn queue_sync(library: &Library, series: &SeriesRef) -> kirei_library::Result<bool> {
    let Some(link) = library.tracker_link(&key_of(library, series)?)? else {
        return Ok(false);
    };
    let progress = local_progress(library, series)?.filter(|p| *p > 0);
    library.enqueue_update(
        link.media_id,
        &UpdateRequest {
            progress,
            ..Default::default()
        },
        0,
    )?;
    Ok(true)
}

fn library_of<R: Runtime>(app: &AppHandle<R>) -> Result<Arc<Library>, String> {
    app.state::<Catalog>().library()
}

fn changed<R: Runtime>(app: &AppHandle<R>) {
    app.state::<Tracking>().wake();
    let _ = app.emit(TRACKING_CHANGED_EVENT, ());
}

#[tauri::command]
pub(crate) async fn anilist_status<R: Runtime>(app: AppHandle<R>) -> Result<AccountStatus, String> {
    let tracking = app.state::<Tracking>().inner().clone();
    Ok(tracking.status().await)
}

/// Opens AniList's authorize page in the browser and waits (up to five
/// minutes) for the redirect to bring the token back.
#[tauri::command]
pub(crate) async fn anilist_sign_in<R: Runtime>(
    app: AppHandle<R>,
) -> Result<AccountStatus, String> {
    let tracking = app.state::<Tracking>().inner().clone();
    let client_id = client_id().ok_or(
        "this build has no AniList client id, so it cannot sign in (see docs/tracking.md)",
    )?;
    let url = authorize_url(&Endpoints::production(), client_id).map_err(|e| e.to_string())?;
    let (cancel, cancelled) = oneshot::channel();
    {
        let mut slot = tracking
            .0
            .signing_in
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        if slot.is_some() {
            return Err("a sign in is already waiting for the browser".into());
        }
        *slot = Some(cancel);
    }
    let result = async {
        let listener = SignInListener::bind(redirect_port())
            .await
            .map_err(|e| e.to_string())?;
        let _ = app.emit(TRACKING_CHANGED_EVENT, ());
        crate::settings::spawn_open(url.as_str().into()).await?;
        tokio::select! {
            token = listener.wait(SIGN_IN_TIMEOUT) => token.map_err(|e| e.to_string()),
            _ = cancelled => Err("the sign in was cancelled".to_owned()),
        }
    }
    .await;
    tracking
        .0
        .signing_in
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .take();
    let outcome = match result {
        Ok(token) => tracking.accept_token(token).await.map(|_| ()),
        Err(error) => Err(error),
    };
    if outcome.is_ok()
        && let Ok(library) = library_of(&app)
    {
        // Updates held for a sign in can go now.
        blocking(&library, |l| l.release_updates(false)).await?;
    }
    changed(&app);
    outcome?;
    Ok(tracking.status().await)
}

/// Stops waiting for the browser.
#[tauri::command]
pub(crate) async fn anilist_cancel_sign_in<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let pending = app
        .state::<Tracking>()
        .0
        .signing_in
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .take();
    if let Some(cancel) = pending {
        let _ = cancel.send(());
    }
    Ok(())
}

/// Forgets the token and drops queued updates: they belong to the account
/// that is going away. Links stay.
#[tauri::command]
pub(crate) async fn anilist_sign_out<R: Runtime>(
    app: AppHandle<R>,
) -> Result<AccountStatus, String> {
    let tracking = app.state::<Tracking>().inner().clone();
    tracking.forget_token().await?;
    if let Ok(library) = library_of(&app) {
        blocking(&library, Library::clear_updates).await?;
    }
    changed(&app);
    Ok(tracking.status().await)
}

/// Manga on AniList for the link picker. Adult entries are left out.
#[tauri::command]
pub(crate) async fn tracking_search<R: Runtime>(
    app: AppHandle<R>,
    query: String,
    page: Option<u32>,
) -> Result<SearchPage, String> {
    let tracking = app.state::<Tracking>().inner().clone();
    tracking
        .0
        .client
        .search_manga(&query, page.unwrap_or(1), 20, false)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn tracking_series<R: Runtime>(
    app: AppHandle<R>,
    series: SeriesRef,
) -> Result<SeriesTracking, String> {
    let library = library_of(&app)?;
    blocking(&library, move |l| series_tracking(l, &series)).await
}

/// Links a series to an AniList entry and reconciles it right away.
#[tauri::command]
pub(crate) async fn tracking_link<R: Runtime>(
    app: AppHandle<R>,
    series: SeriesRef,
    media_id: i64,
    title: Option<String>,
    total_chapters: Option<i64>,
    origin: Option<LinkOrigin>,
) -> Result<SeriesTracking, String> {
    let library = library_of(&app)?;
    let source = match origin {
        Some(LinkOrigin::Mangadex) => LinkSource::Mangadex,
        _ => LinkSource::Manual,
    };
    let result = blocking(&library, move |l| {
        let key = key_of(l, &series)?;
        l.link_series(&key, media_id, source, title.as_deref(), total_chapters)?;
        queue_sync(l, &series)?;
        series_tracking(l, &series)
    })
    .await?;
    changed(&app);
    Ok(result)
}

#[tauri::command]
pub(crate) async fn tracking_unlink<R: Runtime>(
    app: AppHandle<R>,
    series: SeriesRef,
) -> Result<SeriesTracking, String> {
    let library = library_of(&app)?;
    let result = blocking(&library, move |l| {
        l.unlink_series(&key_of(l, &series)?)?;
        series_tracking(l, &series)
    })
    .await?;
    changed(&app);
    Ok(result)
}

/// Reconciles a linked series now: pushes local progress under the conflict
/// rules and refreshes what AniList says.
#[tauri::command]
pub(crate) async fn tracking_sync<R: Runtime>(
    app: AppHandle<R>,
    series: SeriesRef,
) -> Result<SeriesTracking, String> {
    let library = library_of(&app)?;
    let result = blocking(&library, move |l| {
        queue_sync(l, &series)?;
        series_tracking(l, &series)
    })
    .await?;
    changed(&app);
    Ok(result)
}

/// Sets the status (reading, completed, paused, ...) and or the score
/// (0 to 100) of a linked series on AniList. Sent as soon as possible.
#[tauri::command]
pub(crate) async fn tracking_update_entry<R: Runtime>(
    app: AppHandle<R>,
    series: SeriesRef,
    status: Option<ListStatus>,
    score: Option<i64>,
) -> Result<SeriesTracking, String> {
    let library = library_of(&app)?;
    let result = blocking(&library, move |l| {
        let key = key_of(l, &series)?;
        let link = l.tracker_link(&key)?.ok_or_else(|| {
            kirei_library::LibraryError::InvalidInput("link the series first".into())
        })?;
        l.enqueue_update(
            link.media_id,
            &UpdateRequest {
                progress: None,
                status: status.map(|s| s.as_str().to_owned()),
                score: score.map(|s| s.clamp(0, 100)),
            },
            0,
        )?;
        series_tracking(l, &series)
    })
    .await?;
    changed(&app);
    Ok(result)
}

/// Progress of a series the library does not hold (MangaDex reading): queued
/// like a finished local chapter when tracking and auto update are on.
#[tauri::command]
pub(crate) async fn tracking_report_progress<R: Runtime>(
    app: AppHandle<R>,
    series: SeriesRef,
    progress: i64,
) -> Result<bool, String> {
    let library = library_of(&app)?;
    let queued = blocking(&library, move |l| {
        let settings = l.settings()?;
        if !settings.tracking_enabled || !settings.tracking_auto_update || progress <= 0 {
            return Ok(false);
        }
        let Some(link) = l.tracker_link(&key_of(l, &series)?)? else {
            return Ok(false);
        };
        l.enqueue_update(
            link.media_id,
            &UpdateRequest {
                progress: Some(progress),
                ..Default::default()
            },
            FINISH_DEBOUNCE_MS,
        )?;
        Ok(true)
    })
    .await?;
    if queued {
        changed(&app);
    }
    Ok(queued)
}

#[tauri::command]
pub(crate) async fn tracking_queue<R: Runtime>(app: AppHandle<R>) -> Result<QueueSummary, String> {
    let library = library_of(&app)?;
    blocking(&library, Library::queue_summary).await
}

/// Gives failed and held updates another try now.
#[tauri::command]
pub(crate) async fn tracking_retry<R: Runtime>(app: AppHandle<R>) -> Result<QueueSummary, String> {
    let library = library_of(&app)?;
    let summary = blocking(&library, |l| {
        l.release_updates(true)?;
        l.queue_summary()
    })
    .await?;
    changed(&app);
    Ok(summary)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keychain::MemoryStore;
    use kirei_anilist::{Limits, RetryPolicy};
    use wiremock::matchers::{body_string_contains, method};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    const MEDIA: &str = r#"{"data":{"Media":{"id":30013,"title":{"romaji":"Ash"},"chapters":null,
        "mediaListEntry":{"id":1,"status":"CURRENT","progress":4,"score":0,"repeat":0}}}}"#;
    const SAVED: &str = r#"{"data":{"SaveMediaListEntry":{"id":1,"status":"CURRENT","progress":6,
        "score":0,"repeat":0}}}"#;
    const VIEWER: &str = r#"{"data":{"Viewer":{"id":7,"name":"Shirone","avatar":null}}}"#;

    fn config(server: &MockServer) -> ClientConfig {
        let mut config = ClientConfig::new("KireiManga/test");
        config.endpoints = Endpoints::local(&server.uri()).unwrap();
        config.limits = Limits {
            per_minute: 90,
            ceiling: 90,
            min_gap: Duration::ZERO,
        };
        config.retry = RetryPolicy {
            max_retries: 0,
            base_delay: Duration::from_millis(1),
            max_delay: Duration::from_secs(1),
        };
        config
    }

    fn ok(body: &str) -> ResponseTemplate {
        ResponseTemplate::new(200)
            .insert_header("content-type", "application/json")
            .set_body_string(body)
    }

    fn library(enabled: bool) -> (tempfile::TempDir, Arc<Library>) {
        let dir = tempfile::tempdir().unwrap();
        let library = Library::open_in_memory(dir.path()).unwrap();
        library
            .set_setting("tracking.enabled", serde_json::json!(enabled))
            .unwrap();
        (dir, Arc::new(library))
    }

    async fn signed_in(server: &MockServer) -> (Tracking, Arc<MemoryStore>) {
        let store = Arc::new(MemoryStore::default());
        let tracking = Tracking::with(config(server), store.clone());
        Mock::given(method("POST"))
            .and(body_string_contains("Viewer"))
            .respond_with(ok(VIEWER))
            .mount(server)
            .await;
        tracking
            .accept_token(AccessToken::new("secret-token", 3600))
            .await
            .unwrap();
        (tracking, store)
    }

    #[test]
    fn series_refs_parse_from_the_renderer() {
        let local: SeriesRef = serde_json::from_str(r#"{"kind":"local","id":4}"#).unwrap();
        assert_eq!(local, SeriesRef::Local(4));
        let dex: SeriesRef = serde_json::from_str(r#"{"kind":"mangadex","id":"ab-12"}"#).unwrap();
        assert_eq!(dex, SeriesRef::Mangadex("ab-12".into()));
    }

    #[test]
    fn a_mangadex_key_needs_a_real_id() {
        let dir = tempfile::tempdir().unwrap();
        let library = Library::open_in_memory(dir.path()).unwrap();
        assert_eq!(
            key_of(&library, &SeriesRef::Mangadex("0b1f-2c3d".into())).unwrap(),
            "mangadex:0b1f-2c3d"
        );
        assert!(key_of(&library, &SeriesRef::Mangadex("../x".into())).is_err());
    }

    /// A library with one series of two chapters, scanned from CBZ files.
    fn scanned_library(dir: &std::path::Path) -> (Arc<Library>, i64, Vec<i64>) {
        use std::io::Write;
        let series = dir.join("root").join("Ash");
        std::fs::create_dir_all(&series).unwrap();
        for number in 1..=2 {
            let file = std::fs::File::create(series.join(format!("Ash c{number:03}.cbz"))).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            for page in ["1.png", "2.png"] {
                zip.start_file(page, zip::write::SimpleFileOptions::default())
                    .unwrap();
                zip.write_all(b"not really a png").unwrap();
            }
            zip.finish().unwrap();
        }
        let library = Library::open_in_memory(&dir.join("covers")).unwrap();
        library.add_root(&dir.join("root")).unwrap();
        library.scan(None, &|_| {}).unwrap();
        let summary = library.series().unwrap().remove(0);
        let chapters = library
            .series_detail(summary.id)
            .unwrap()
            .unwrap()
            .chapters
            .iter()
            .map(|c| c.id)
            .collect();
        (Arc::new(library), summary.id, chapters)
    }

    #[tokio::test]
    async fn a_finished_chapter_queues_its_number_when_linked_and_enabled() {
        let dir = tempfile::tempdir().unwrap();
        let (library, series_id, chapters) = scanned_library(dir.path());
        let second = chapters[1];

        // Not linked, tracking off: nothing.
        assert!(!queue_finished_chapter(&library, second).await.unwrap());
        let key = library.series_key(series_id).unwrap();
        library
            .link_series(&key, 30013, LinkSource::Manual, None, None)
            .unwrap();
        assert!(!queue_finished_chapter(&library, second).await.unwrap());

        library
            .set_setting("tracking.enabled", serde_json::json!(true))
            .unwrap();
        assert!(queue_finished_chapter(&library, second).await.unwrap());
        let queued = library.queued_update(30013).unwrap().unwrap();
        assert_eq!(queued.progress, Some(2));
        assert!(queued.next_attempt_at > kirei_anilist_now(), "debounced");

        // Auto update off: finishing a chapter sends nothing.
        library.clear_updates().unwrap();
        library
            .set_setting("tracking.autoUpdate", serde_json::json!(false))
            .unwrap();
        assert!(!queue_finished_chapter(&library, second).await.unwrap());

        // The series page counts completed chapters for a manual sync.
        library.record_progress(chapters[0], 1).unwrap();
        let state = series_tracking(&library, &SeriesRef::Local(series_id)).unwrap();
        assert_eq!(state.local_progress, Some(1));
        assert_eq!(state.series_key, "local:dir:Ash");
        assert!(queue_sync(&library, &SeriesRef::Local(series_id)).unwrap());
        assert_eq!(
            library.queued_update(30013).unwrap().unwrap().progress,
            Some(1)
        );
    }

    #[tokio::test]
    async fn a_token_goes_to_the_keychain_and_comes_back() {
        let server = MockServer::start().await;
        let (tracking, store) = signed_in(&server).await;
        let stored = store.get(TOKEN_ACCOUNT).unwrap().unwrap();
        assert!(stored.contains("secret-token"));
        let status = tracking.status().await;
        assert!(status.signed_in);
        assert_eq!(status.viewer.unwrap().name, "Shirone");
        assert!(
            !serde_json::to_string(&tracking.status().await)
                .unwrap()
                .contains("secret-token")
        );

        // A fresh start restores it from the store.
        let again = Tracking::with(config(&server), store.clone());
        again.restore().await;
        assert!(again.0.client.is_signed_in());

        tracking.forget_token().await.unwrap();
        assert_eq!(store.get(TOKEN_ACCOUNT).unwrap(), None);
    }

    #[tokio::test]
    async fn an_expired_stored_token_is_dropped() {
        let server = MockServer::start().await;
        let store = Arc::new(MemoryStore::default());
        store
            .set(
                TOKEN_ACCOUNT,
                &serde_json::to_string(&AccessToken::new("old", 0)).unwrap(),
            )
            .unwrap();
        let tracking = Tracking::with(config(&server), store.clone());
        tracking.restore().await;
        assert!(!tracking.0.client.is_signed_in());
        assert_eq!(store.get(TOKEN_ACCOUNT).unwrap(), None);
    }

    #[tokio::test]
    async fn nothing_is_sent_while_tracking_is_off() {
        let server = MockServer::start().await;
        let (tracking, _) = signed_in(&server).await;
        let (_dir, library) = library(false);
        library
            .enqueue_update(
                30013,
                &UpdateRequest {
                    progress: Some(6),
                    ..Default::default()
                },
                0,
            )
            .unwrap();
        let (pass, wait) = tracking.pass(&library).await.unwrap();
        assert_eq!(pass, Pass::default());
        assert_eq!(wait, IDLE_WAKE);
        assert_eq!(library.queue_summary().unwrap().pending, 1);
    }

    #[tokio::test]
    async fn the_queue_survives_an_outage_and_delivers_after() {
        let server = MockServer::start().await;
        let (tracking, _) = signed_in(&server).await;
        let (_dir, library) = library(true);
        library
            .link_series("local:dir:Ash", 30013, LinkSource::Manual, None, None)
            .unwrap();
        library
            .enqueue_update(
                30013,
                &UpdateRequest {
                    progress: Some(6),
                    ..Default::default()
                },
                0,
            )
            .unwrap();

        // AniList is down: the update stays, with a retry time and the reason.
        let outage = Mock::given(method("POST"))
            .and(body_string_contains("Media(id"))
            .respond_with(ResponseTemplate::new(503))
            .mount_as_scoped(&server)
            .await;
        let (pass, wait) = tracking.pass(&library).await.unwrap();
        assert_eq!(pass.delivered, 0);
        assert!(wait > Duration::from_secs(20), "backs off, {wait:?}");
        let summary = library.queue_summary().unwrap();
        assert_eq!(summary.pending, 1);
        assert!(summary.last_error.unwrap().contains("503"));
        drop(outage);

        // Back online and the retry time passed: it goes through.
        Mock::given(method("POST"))
            .and(body_string_contains("Media(id"))
            .respond_with(ok(MEDIA))
            .mount(&server)
            .await;
        Mock::given(method("POST"))
            .and(body_string_contains("SaveMediaListEntry"))
            .respond_with(ok(SAVED))
            .expect(1)
            .mount(&server)
            .await;
        let queued = library.queued_update(30013).unwrap().unwrap();
        library
            .retry_update(queued.id, queued.revision, "", 0)
            .unwrap();
        let (pass, _) = tracking.pass(&library).await.unwrap();
        assert_eq!(pass.delivered, 1);
        assert_eq!(library.queue_summary().unwrap(), QueueSummary::default());
        let link = library.tracker_link("local:dir:Ash").unwrap().unwrap();
        assert_eq!(link.remote_progress, Some(6));
        assert_eq!(link.synced_progress, Some(6));
    }

    #[tokio::test]
    async fn a_rejected_token_holds_the_queue_and_signs_out() {
        let server = MockServer::start().await;
        let (tracking, store) = signed_in(&server).await;
        let (_dir, library) = library(true);
        library
            .enqueue_update(
                30013,
                &UpdateRequest {
                    progress: Some(6),
                    ..Default::default()
                },
                0,
            )
            .unwrap();
        Mock::given(method("POST"))
            .and(body_string_contains("Media(id"))
            .respond_with(
                ResponseTemplate::new(400)
                    .set_body_string(r#"{"errors":[{"message":"Invalid token","status":400}]}"#),
            )
            .mount(&server)
            .await;
        let (pass, _) = tracking.pass(&library).await.unwrap();
        assert!(pass.signed_out);
        assert!(!tracking.0.client.is_signed_in());
        assert_eq!(store.get(TOKEN_ACCOUNT).unwrap(), None);
        assert_eq!(library.queue_summary().unwrap().blocked, 1);
    }

    #[tokio::test]
    async fn remote_ahead_is_recorded_not_overwritten() {
        let server = MockServer::start().await;
        let (tracking, _) = signed_in(&server).await;
        let (_dir, library) = library(true);
        library
            .link_series("local:dir:Ash", 30013, LinkSource::Manual, None, None)
            .unwrap();
        library
            .enqueue_update(
                30013,
                &UpdateRequest {
                    progress: Some(2),
                    ..Default::default()
                },
                0,
            )
            .unwrap();
        Mock::given(method("POST"))
            .and(body_string_contains("Media(id"))
            .respond_with(ok(MEDIA))
            .mount(&server)
            .await;
        Mock::given(method("POST"))
            .and(body_string_contains("SaveMediaListEntry"))
            .respond_with(ok(SAVED))
            .expect(0)
            .mount(&server)
            .await;
        tracking.pass(&library).await.unwrap();
        let link = library.tracker_link("local:dir:Ash").unwrap().unwrap();
        assert_eq!(link.remote_progress, Some(4));
        assert_eq!(link.synced_progress, None);
        assert_eq!(library.queue_summary().unwrap().pending, 0);
    }
}
