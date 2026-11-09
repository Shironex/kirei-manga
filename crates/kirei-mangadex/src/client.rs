//! The MangaDex client callers hold.

use std::collections::{BTreeMap, HashMap};
use std::sync::{Arc, Mutex, PoisonError, RwLock};
use std::time::Duration;

use bytes::Bytes;
use reqwest::Method;
use tokio::time::Instant;
use url::Url;

use crate::at_home::{AtHomeServer, ImageQuality, PageImage, Report};
use crate::auth::{
    ClientCredentials, Secret, Session, TokenError, TokenResponse, TokenSet, TokenSink, notify,
};
use crate::config::{CacheConfig, ClientConfig, Endpoints};
use crate::error::{MangaDexError, Result};
use crate::http::{Body, Bucket, Failure, Http, Request};
use crate::language::{LanguagePrefs, LocalizedChapters, resolve_chapters};
use crate::model::{Chapter, ContentRating, Cover, CoverSize, Manga, Page, ReadingStatus, Tag};
use crate::query::{FeedOrder, FeedQuery, SearchQuery, check_id};
use crate::wire::{
    AtHomeBody, Collection, Entity, StatusBody, StatusesBody, WireChapter, WireCover, WireManga,
    WireTag, parse,
};

/// Refresh the access token when it has less than this left.
const REFRESH_MARGIN: Duration = Duration::from_secs(60);
/// The most chapters [`MangaDex::chapters`] walks through for one series.
const MAX_FEED_PAGES: u32 = 40;

#[derive(Debug, Clone)]
struct Settings {
    languages: LanguagePrefs,
    ratings: Vec<ContentRating>,
}

/// Options for [`MangaDex::chapters`].
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ChapterListOptions {
    /// Key chapters by volume as well as number, for series whose numbering
    /// restarts each volume ([`Manga::chapter_numbers_reset_on_new_volume`]).
    pub by_volume: bool,
}

struct Inner {
    http: Http,
    endpoints: Endpoints,
    cache_ttl: CacheConfig,
    force_port_443: bool,
    image_attempts: u32,
    token_sink: Option<Arc<dyn TokenSink>>,
    settings: RwLock<Settings>,
    session: tokio::sync::Mutex<Option<Session>>,
    servers: Mutex<HashMap<String, (Arc<AtHomeServer>, Instant)>>,
    server_fetch: tokio::sync::Mutex<()>,
}

/// A MangaDex API client. Cheap to clone; clones share the rate limits, the
/// cache and the session.
#[derive(Clone)]
pub struct MangaDex {
    inner: Arc<Inner>,
}

impl std::fmt::Debug for MangaDex {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MangaDex")
            .field("api", &self.inner.endpoints.api.as_str())
            .finish_non_exhaustive()
    }
}

impl MangaDex {
    pub fn new(config: ClientConfig) -> Result<Self> {
        config.validate()?;
        Ok(Self {
            inner: Arc::new(Inner {
                http: Http::new(&config)?,
                endpoints: config.endpoints,
                cache_ttl: config.cache,
                force_port_443: config.force_port_443,
                image_attempts: config.image_attempts,
                token_sink: config.token_sink,
                settings: RwLock::new(Settings {
                    languages: config.languages,
                    ratings: config.content_ratings,
                }),
                session: tokio::sync::Mutex::new(None),
                servers: Mutex::new(HashMap::new()),
                server_fetch: tokio::sync::Mutex::new(()),
            }),
        })
    }

    // Settings -----------------------------------------------------------

    fn settings(&self) -> Settings {
        self.inner
            .settings
            .read()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    pub fn languages(&self) -> LanguagePrefs {
        self.settings().languages
    }

    pub fn set_languages(&self, languages: LanguagePrefs) {
        self.inner
            .settings
            .write()
            .unwrap_or_else(PoisonError::into_inner)
            .languages = languages;
    }

    pub fn content_ratings(&self) -> Vec<ContentRating> {
        self.settings().ratings
    }

    pub fn set_content_ratings(&self, ratings: Vec<ContentRating>) -> Result<()> {
        if ratings.is_empty() {
            return Err(MangaDexError::InvalidInput(
                "pick at least one content rating".into(),
            ));
        }
        self.inner
            .settings
            .write()
            .unwrap_or_else(PoisonError::into_inner)
            .ratings = ratings;
        Ok(())
    }

    /// Drops every cached response, for a manual refresh.
    pub fn clear_cache(&self) {
        self.inner.http.cache.clear();
        self.inner
            .servers
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clear();
    }

    fn api(&self, path: &str) -> Result<Url> {
        self.inner
            .endpoints
            .api
            .join(path)
            .map_err(|error| MangaDexError::InvalidInput(format!("bad API path: {error}")))
    }

    async fn get_public(&self, request: Request) -> Result<Bytes> {
        let what = request.what;
        self.inner
            .http
            .send(request)
            .await
            .map_err(|failure| failure.into_error(what))
    }

    // Catalogue ----------------------------------------------------------

    /// Searches series. Results include the cover, authors and artists.
    pub async fn search(&self, query: &SearchQuery) -> Result<Page<Manga>> {
        let settings = self.settings();
        let mut url = self.api("manga")?;
        query.apply(&mut url, &settings.languages, &settings.ratings)?;
        let body = self
            .get_public(Request::get(url, "manga").cached(self.inner.cache_ttl.lists))
            .await?;
        Ok(parse::<Collection<WireManga>>(&body)?.into_page(Manga::from))
    }

    /// One series with its cover, authors and artists.
    pub async fn manga(&self, id: &str) -> Result<Manga> {
        check_id(id)?;
        let mut url = self.api(&format!("manga/{id}"))?;
        url.query_pairs_mut()
            .append_pair("includes[]", "cover_art")
            .append_pair("includes[]", "author")
            .append_pair("includes[]", "artist");
        let body = self
            .get_public(Request::get(url, "manga").cached(self.inner.cache_ttl.details))
            .await?;
        Ok(parse::<Entity<WireManga>>(&body)?.data.into())
    }

    /// Every tag, for browse filters.
    pub async fn tags(&self) -> Result<Vec<Tag>> {
        let url = self.api("manga/tag")?;
        let body = self
            .get_public(Request::get(url, "tag list").cached(self.inner.cache_ttl.tags))
            .await?;
        Ok(parse::<Collection<WireTag>>(&body)?
            .data
            .into_iter()
            .map(Tag::from)
            .collect())
    }

    /// Every cover of a series, volume covers included.
    pub async fn covers(&self, manga_id: &str) -> Result<Vec<Cover>> {
        check_id(manga_id)?;
        let mut url = self.api("cover")?;
        url.query_pairs_mut()
            .append_pair("manga[]", manga_id)
            .append_pair("limit", "100")
            .append_pair("order[volume]", "asc");
        let body = self
            .get_public(Request::get(url, "cover list").cached(self.inner.cache_ttl.details))
            .await?;
        Ok(parse::<Collection<WireCover>>(&body)?
            .data
            .into_iter()
            .map(Cover::from)
            .collect())
    }

    /// The URL of a cover image. Download it through [`MangaDex::cover`];
    /// MangaDex does not allow hotlinking.
    pub fn cover_url(&self, manga_id: &str, cover: &Cover, size: CoverSize) -> Result<Url> {
        check_id(manga_id)?;
        let file = cover.file_name.as_str();
        if file.is_empty() || file.contains(['/', '\\', '?', '#']) || file.contains("..") {
            return Err(MangaDexError::InvalidInput(format!(
                "{file:?} is not a cover file name"
            )));
        }
        let suffix = match size {
            CoverSize::Original => "",
            CoverSize::Medium512 => ".512.jpg",
            CoverSize::Small256 => ".256.jpg",
        };
        self.inner
            .endpoints
            .uploads
            .join(&format!("covers/{manga_id}/{file}{suffix}"))
            .map_err(|error| MangaDexError::InvalidInput(format!("bad cover path: {error}")))
    }

    /// Downloads a cover image.
    pub async fn cover(&self, manga_id: &str, cover: &Cover, size: CoverSize) -> Result<Bytes> {
        let url = self.cover_url(manga_id, cover, size)?;
        self.inner.http.cover(url).await
    }

    // Chapters -----------------------------------------------------------

    /// One page of a series' chapters, in the reader's languages unless the
    /// query overrides them. Includes scanlation groups and uploaders for
    /// credits.
    pub async fn chapter_feed(&self, manga_id: &str, query: &FeedQuery) -> Result<Page<Chapter>> {
        check_id(manga_id)?;
        let settings = self.settings();
        self.feed_page(manga_id, query, &settings.languages, &settings.ratings)
            .await
    }

    async fn feed_page(
        &self,
        manga_id: &str,
        query: &FeedQuery,
        languages: &LanguagePrefs,
        ratings: &[ContentRating],
    ) -> Result<Page<Chapter>> {
        let mut url = self.api(&format!("manga/{manga_id}/feed"))?;
        query.apply(&mut url, languages, ratings)?;
        let body = self
            .get_public(Request::get(url, "manga").cached(self.inner.cache_ttl.lists))
            .await?;
        Ok(parse::<Collection<WireChapter>>(&body)?.into_page(Chapter::from))
    }

    /// Every chapter of a series in the reader's language chain, each
    /// chapter number taken from the first language that has it. The result
    /// says whether the preferred language covered the series, part of it,
    /// or nothing.
    ///
    /// One request per 500 chapters, for all languages of the chain at once.
    pub async fn chapters(
        &self,
        manga_id: &str,
        options: ChapterListOptions,
    ) -> Result<LocalizedChapters> {
        check_id(manga_id)?;
        let settings = self.settings();
        let mut all = Vec::new();
        let mut query = FeedQuery {
            limit: Some(500),
            order: FeedOrder::ReadingOrder,
            ..FeedQuery::default()
        };
        for _ in 0..MAX_FEED_PAGES {
            let page = self
                .feed_page(manga_id, &query, &settings.languages, &settings.ratings)
                .await?;
            let more = page.has_more();
            query.offset = page.offset.saturating_add(page.items.len() as u32);
            all.extend(page.items);
            if !more {
                break;
            }
        }
        Ok(resolve_chapters(
            all,
            &settings.languages,
            options.by_volume,
        ))
    }

    /// One chapter with its groups and uploader.
    pub async fn chapter(&self, id: &str) -> Result<Chapter> {
        check_id(id)?;
        let mut url = self.api(&format!("chapter/{id}"))?;
        url.query_pairs_mut()
            .append_pair("includes[]", "scanlation_group")
            .append_pair("includes[]", "user");
        let body = self
            .get_public(Request::get(url, "chapter").cached(self.inner.cache_ttl.details))
            .await?;
        Ok(parse::<Entity<WireChapter>>(&body)?.data.into())
    }

    // MangaDex@Home ------------------------------------------------------

    /// The image server for a chapter. Reused for a while (MangaDex
    /// guarantees 15 minutes) and shared by concurrent callers, so a chapter
    /// costs one request against the at-home budget of 40 a minute.
    pub async fn at_home_server(&self, chapter_id: &str) -> Result<Arc<AtHomeServer>> {
        check_id(chapter_id)?;
        if let Some(server) = self.cached_server(chapter_id) {
            return Ok(server);
        }
        let _single_flight = self.inner.server_fetch.lock().await;
        if let Some(server) = self.cached_server(chapter_id) {
            return Ok(server);
        }
        let mut url = self.api(&format!("at-home/server/{chapter_id}"))?;
        if self.inner.force_port_443 {
            url.query_pairs_mut().append_pair("forcePort443", "true");
        }
        let body = self
            .get_public(Request::get(url, "chapter").bucket(Bucket::AtHome))
            .await?;
        let server = Arc::new(AtHomeServer::from(parse::<AtHomeBody>(&body)?));
        self.inner
            .servers
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .insert(chapter_id.to_string(), (server.clone(), Instant::now()));
        Ok(server)
    }

    fn cached_server(&self, chapter_id: &str) -> Option<Arc<AtHomeServer>> {
        let ttl = self.inner.cache_ttl.at_home;
        let servers = self
            .inner
            .servers
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        servers
            .get(chapter_id)
            .filter(|(_, fetched)| fetched.elapsed() < ttl)
            .map(|(server, _)| server.clone())
    }

    /// Forgets a server after a failed page, unless a concurrent caller has
    /// already replaced it.
    fn drop_server(&self, chapter_id: &str, failed: &Arc<AtHomeServer>) {
        let mut servers = self
            .inner
            .servers
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        if servers
            .get(chapter_id)
            .is_some_and(|(current, _)| Arc::ptr_eq(current, failed))
        {
            servers.remove(chapter_id);
        }
    }

    /// Downloads one page (zero based). Each load is reported to the
    /// MangaDex@Home network as its policy asks. On a failure the client asks
    /// for another server and tries again, up to the configured attempts.
    pub async fn page(
        &self,
        chapter_id: &str,
        index: usize,
        quality: ImageQuality,
    ) -> Result<PageImage> {
        let attempts = self.inner.image_attempts;
        for _ in 0..attempts {
            let server = self.at_home_server(chapter_id).await?;
            let count = server.page_count(quality);
            let (Some(url), Some(file_name)) = (
                server.page_url(quality, index),
                server.file_names(quality).get(index).cloned(),
            ) else {
                return Err(MangaDexError::InvalidInput(format!(
                    "chapter {chapter_id} has {count} pages, no page {index}"
                )));
            };

            let started = Instant::now();
            let result = self.inner.http.image(&url).await;
            let duration = started.elapsed().as_millis() as u64;
            let (page, cached, bytes) = match result {
                Ok(response) => {
                    let cached = response.cache_hit;
                    match response.body {
                        Ok(body) if response.status.is_success() && !body.is_empty() => {
                            let size = body.len();
                            let page = PageImage {
                                bytes: body,
                                content_type: response.content_type,
                                file_name,
                            };
                            (Some(page), cached, size)
                        }
                        _ => (None, cached, 0),
                    }
                }
                Err(_) => (None, false, 0),
            };
            if server.reports() {
                self.report(&Report {
                    url: &url,
                    success: page.is_some(),
                    cached,
                    bytes,
                    duration,
                })
                .await;
            }
            match page {
                Some(page) => return Ok(page),
                None => self.drop_server(chapter_id, &server),
            }
        }
        Err(MangaDexError::ImageUnavailable {
            chapter: chapter_id.to_string(),
            index,
            attempts,
        })
    }

    async fn report(&self, report: &Report<'_>) {
        if let Ok(json) = serde_json::to_vec(report) {
            self.inner
                .http
                .report(self.inner.endpoints.report.clone(), json)
                .await;
        }
    }

    // Session ------------------------------------------------------------

    /// Signs in with a personal API client and the account's username and
    /// password. The password is used for this one request and not kept.
    /// Returns the new tokens (also passed to the token sink).
    pub async fn sign_in(
        &self,
        client: ClientCredentials,
        username: &str,
        password: &Secret,
    ) -> Result<TokenSet> {
        if username.trim().is_empty() || password.expose().is_empty() {
            return Err(MangaDexError::InvalidInput(
                "enter the MangaDex username and password".into(),
            ));
        }
        let form = url::form_urlencoded::Serializer::new(String::new())
            .append_pair("grant_type", "password")
            .append_pair("username", username.trim())
            .append_pair("password", password.expose())
            .append_pair("client_id", &client.client_id)
            .append_pair("client_secret", client.client_secret.expose())
            .finish();
        let tokens = match self.token_request(form, Bucket::SignIn).await {
            Ok(tokens) => tokens,
            Err(Failure::BadRequest(body) | Failure::Unauthorized(body)) => {
                let message = TokenError::parse(&body)
                    .map(|error| error.message())
                    .unwrap_or_else(|| "the sign in was refused".into());
                return Err(MangaDexError::SignIn(message));
            }
            Err(failure) => return Err(failure.into_error("sign in")),
        };
        *self.inner.session.lock().await = Some(Session {
            client,
            tokens: tokens.clone(),
        });
        notify(&self.inner.token_sink, Some(&tokens));
        Ok(tokens)
    }

    /// Resumes a session from stored tokens without a network call. The
    /// access token is refreshed on first use if it has expired.
    pub async fn restore_session(&self, client: ClientCredentials, tokens: TokenSet) {
        *self.inner.session.lock().await = Some(Session { client, tokens });
    }

    /// Ends the session in memory and tells the token sink to forget the
    /// stored tokens.
    pub async fn sign_out(&self) {
        *self.inner.session.lock().await = None;
        notify(&self.inner.token_sink, None);
    }

    pub async fn is_signed_in(&self) -> bool {
        self.inner.session.lock().await.is_some()
    }

    async fn token_request(
        &self,
        form: String,
        bucket: Bucket,
    ) -> std::result::Result<TokenSet, Failure> {
        let request = Request {
            method: Method::POST,
            url: self.inner.endpoints.token.clone(),
            bucket,
            bearer: None,
            body: Some(Body::Form(form)),
            cache_ttl: None,
            what: "token",
        };
        let body = self.inner.http.send(request).await?;
        Ok(parse::<TokenResponse>(&body)?.into_tokens())
    }

    /// A valid access token, refreshed first when it is about to expire.
    /// `force` refreshes even if it looks valid (after a 401).
    async fn bearer(&self, force: bool) -> Result<Secret> {
        let mut session = self.inner.session.lock().await;
        let Some(current) = session.as_ref() else {
            return Err(MangaDexError::NotSignedIn);
        };
        if !force && !current.tokens.access_expires_within(REFRESH_MARGIN) {
            return Ok(current.tokens.access_token.clone());
        }
        if current.tokens.refresh_expired() {
            *session = None;
            notify(&self.inner.token_sink, None);
            return Err(MangaDexError::SessionExpired);
        }
        let form = url::form_urlencoded::Serializer::new(String::new())
            .append_pair("grant_type", "refresh_token")
            .append_pair("refresh_token", current.tokens.refresh_token.expose())
            .append_pair("client_id", &current.client.client_id)
            .append_pair("client_secret", current.client.client_secret.expose())
            .finish();
        // The session lock stays held, so concurrent callers wait for this
        // one refresh instead of each sending their own.
        match self.token_request(form, Bucket::Refresh).await {
            Ok(tokens) => {
                let access = tokens.access_token.clone();
                if let Some(current) = session.as_mut() {
                    current.tokens = tokens;
                    notify(&self.inner.token_sink, Some(&current.tokens));
                }
                Ok(access)
            }
            Err(Failure::BadRequest(_) | Failure::Unauthorized(_)) => {
                *session = None;
                notify(&self.inner.token_sink, None);
                Err(MangaDexError::SessionExpired)
            }
            Err(failure) => Err(failure.into_error("token")),
        }
    }

    /// Sends a request as the signed-in user; on a 401 refreshes once and
    /// retries.
    async fn authed(
        &self,
        method: Method,
        url: Url,
        body: Option<Vec<u8>>,
        what: &'static str,
    ) -> Result<Bytes> {
        let mut force = false;
        loop {
            let token = self.bearer(force).await?;
            let request = Request {
                method: method.clone(),
                url: url.clone(),
                bucket: Bucket::Global,
                bearer: Some(token),
                body: body.clone().map(Body::Json),
                cache_ttl: None,
                what,
            };
            match self.inner.http.send(request).await {
                Ok(body) => return Ok(body),
                Err(Failure::Unauthorized(_)) if !force => force = true,
                Err(Failure::Unauthorized(_)) => return Err(MangaDexError::SessionExpired),
                Err(failure) => return Err(failure.into_error(what)),
            }
        }
    }

    // Follows and reading status -------------------------------------------

    /// The series the user follows, with covers.
    pub async fn followed_manga(&self, limit: u32, offset: u32) -> Result<Page<Manga>> {
        if !(1..=100).contains(&limit) {
            return Err(MangaDexError::InvalidInput(
                "limit must be between 1 and 100".into(),
            ));
        }
        let mut url = self.api("user/follows/manga")?;
        url.query_pairs_mut()
            .append_pair("limit", &limit.to_string())
            .append_pair("offset", &offset.to_string())
            .append_pair("includes[]", "cover_art");
        let body = self.authed(Method::GET, url, None, "follow list").await?;
        Ok(parse::<Collection<WireManga>>(&body)?.into_page(Manga::from))
    }

    /// New chapters of followed series, newest first by default, in the
    /// reader's languages. Group them by [`Chapter::manga_id`] for an updates
    /// feed; pass `published_since` to refresh.
    pub async fn followed_feed(&self, query: &FeedQuery) -> Result<Page<Chapter>> {
        let settings = self.settings();
        let mut url = self.api("user/follows/manga/feed")?;
        let query = FeedQuery {
            order: if query.order == FeedOrder::default() {
                FeedOrder::NewestFirst
            } else {
                query.order
            },
            ..query.clone()
        };
        query.apply(&mut url, &settings.languages, &settings.ratings)?;
        let body = self.authed(Method::GET, url, None, "feed").await?;
        Ok(parse::<Collection<WireChapter>>(&body)?.into_page(Chapter::from))
    }

    pub async fn is_following(&self, manga_id: &str) -> Result<bool> {
        check_id(manga_id)?;
        let url = self.api(&format!("user/follows/manga/{manga_id}"))?;
        match self.authed(Method::GET, url, None, "follow").await {
            Ok(_) => Ok(true),
            Err(MangaDexError::NotFound(_)) => Ok(false),
            Err(error) => Err(error),
        }
    }

    pub async fn follow(&self, manga_id: &str) -> Result<()> {
        check_id(manga_id)?;
        let url = self.api(&format!("manga/{manga_id}/follow"))?;
        self.authed(Method::POST, url, None, "manga").await?;
        Ok(())
    }

    pub async fn unfollow(&self, manga_id: &str) -> Result<()> {
        check_id(manga_id)?;
        let url = self.api(&format!("manga/{manga_id}/follow"))?;
        self.authed(Method::DELETE, url, None, "manga").await?;
        Ok(())
    }

    /// Reading statuses of every series that has one, keyed by manga id.
    /// `filter` keeps only one status.
    pub async fn reading_statuses(
        &self,
        filter: Option<ReadingStatus>,
    ) -> Result<BTreeMap<String, ReadingStatus>> {
        let mut url = self.api("manga/status")?;
        if let Some(status) = filter {
            url.query_pairs_mut().append_pair("status", status.as_api());
        }
        let body = self.authed(Method::GET, url, None, "status list").await?;
        Ok(parse::<StatusesBody>(&body)?
            .statuses
            .into_iter()
            .filter_map(|(id, status)| ReadingStatus::from_api(&status).map(|status| (id, status)))
            .collect())
    }

    pub async fn reading_status(&self, manga_id: &str) -> Result<Option<ReadingStatus>> {
        check_id(manga_id)?;
        let url = self.api(&format!("manga/{manga_id}/status"))?;
        let body = self.authed(Method::GET, url, None, "manga").await?;
        Ok(parse::<StatusBody>(&body)?
            .status
            .as_deref()
            .and_then(ReadingStatus::from_api))
    }

    /// Sets a series' reading status; `None` removes it.
    pub async fn set_reading_status(
        &self,
        manga_id: &str,
        status: Option<ReadingStatus>,
    ) -> Result<()> {
        check_id(manga_id)?;
        let url = self.api(&format!("manga/{manga_id}/status"))?;
        let body = serde_json::to_vec(&serde_json::json!({
            "status": status.map(ReadingStatus::as_api),
        }))
        .map_err(MangaDexError::decode)?;
        self.authed(Method::POST, url, Some(body), "manga").await?;
        Ok(())
    }
}
