//! The AniList client: the viewer, manga search and the viewer's list entries.

use std::sync::{Arc, PoisonError, RwLock};

use serde::Deserialize;
use serde_json::{Map, Value, json};

use crate::config::ClientConfig;
use crate::error::{AniListError, Result};
use crate::http::Http;
use crate::model::{EntryUpdate, ListEntry, ListStatus, Media, MediaTitle, SearchPage, Viewer};
use crate::token::{AccessToken, Secret};

const MEDIA_FIELDS: &str = "id title { romaji english native userPreferred } synonyms format \
     status chapters volumes startDate { year } coverImage { large } siteUrl isAdult";

const ENTRY_FIELDS: &str = "id status progress score(format: POINT_100) repeat updatedAt";

const VIEWER_QUERY: &str = "query { Viewer { id name avatar { medium } siteUrl } }";

/// The most results one search page asks for.
pub const MAX_PAGE_SIZE: u32 = 25;

/// One AniList client per app. Clones share the rate limit and the token, so
/// the app as a whole stays inside AniList's budget.
#[derive(Debug, Clone)]
pub struct AniList {
    inner: Arc<Inner>,
}

#[derive(Debug)]
struct Inner {
    http: Http,
    token: RwLock<Option<AccessToken>>,
}

impl AniList {
    pub fn new(config: ClientConfig) -> Result<Self> {
        Ok(Self {
            inner: Arc::new(Inner {
                http: Http::new(&config)?,
                token: RwLock::new(None),
            }),
        })
    }

    /// Uses `token` for every later call. Nothing is sent until then.
    pub fn set_token(&self, token: Option<AccessToken>) {
        *self
            .inner
            .token
            .write()
            .unwrap_or_else(PoisonError::into_inner) = token;
    }

    pub fn is_signed_in(&self) -> bool {
        self.inner
            .token
            .read()
            .unwrap_or_else(PoisonError::into_inner)
            .as_ref()
            .is_some_and(|token| !token.is_expired())
    }

    /// The requests per minute the client allows itself now: the degraded
    /// figure until AniList reports its own limit.
    pub async fn rate_limit(&self) -> u32 {
        self.inner.http.limiter.max().await
    }

    fn bearer(&self) -> Result<Secret> {
        let token = self
            .inner
            .token
            .read()
            .unwrap_or_else(PoisonError::into_inner);
        match token.as_ref() {
            Some(token) if token.is_expired() => Err(AniListError::TokenRejected),
            Some(token) => Ok(token.access_token.clone()),
            None => Err(AniListError::NotSignedIn),
        }
    }

    /// The bearer when signed in; public queries go without one.
    fn optional_bearer(&self) -> Option<Secret> {
        self.bearer().ok()
    }

    /// Who the token belongs to. Also how a new token is checked.
    pub async fn viewer(&self) -> Result<Viewer> {
        let bearer = self.bearer()?;
        let data = self
            .inner
            .http
            .graphql(VIEWER_QUERY, json!({}), Some(&bearer), "user")
            .await?;
        let wire: ViewerData = decode(data)?;
        Ok(Viewer {
            id: wire.viewer.id,
            name: wire.viewer.name,
            avatar: wire.viewer.avatar.and_then(|a| a.medium),
            site_url: wire.viewer.site_url,
        })
    }

    /// Manga matching `text`, best matches first. Adult entries are only
    /// listed when `include_adult` is set. Works signed out too, without the
    /// list entries.
    pub async fn search_manga(
        &self,
        text: &str,
        page: u32,
        per_page: u32,
        include_adult: bool,
    ) -> Result<SearchPage> {
        let text = text.trim();
        if text.is_empty() {
            return Err(AniListError::InvalidInput("type a title to search".into()));
        }
        let bearer = self.optional_bearer();
        let entry = if bearer.is_some() {
            format!("mediaListEntry {{ {ENTRY_FIELDS} }}")
        } else {
            String::new()
        };
        let adult = if include_adult {
            ""
        } else {
            ", isAdult: false"
        };
        let query = format!(
            "query ($search: String, $page: Int, $perPage: Int) {{ \
               Page(page: $page, perPage: $perPage) {{ pageInfo {{ hasNextPage }} \
                 media(search: $search, type: MANGA, sort: SEARCH_MATCH{adult}) \
                   {{ {MEDIA_FIELDS} {entry} }} }} }}"
        );
        let variables = json!({
            "search": text,
            "page": page.max(1),
            "perPage": per_page.clamp(1, MAX_PAGE_SIZE),
        });
        let data = self
            .inner
            .http
            .graphql(&query, variables, bearer.as_ref(), "manga")
            .await?;
        let wire: PageData = decode(data)?;
        Ok(SearchPage {
            media: wire
                .page
                .media
                .into_iter()
                .map(WireMedia::into_media)
                .collect(),
            has_next_page: wire.page.page_info.has_next_page,
        })
    }

    /// One manga with the viewer's list entry (`None` when it is not on their
    /// list). Needs a sign in.
    pub async fn manga(&self, id: i64) -> Result<Media> {
        let bearer = self.bearer()?;
        let query = format!(
            "query ($id: Int) {{ Media(id: $id, type: MANGA) \
               {{ {MEDIA_FIELDS} mediaListEntry {{ {ENTRY_FIELDS} }} }} }}"
        );
        let data = self
            .inner
            .http
            .graphql(&query, json!({ "id": id }), Some(&bearer), "manga")
            .await?;
        let wire: MediaData = decode(data)?;
        wire.media
            .map(WireMedia::into_media)
            .ok_or(AniListError::NotFound("manga"))
    }

    /// Creates or changes the viewer's entry for `media_id`. Only the fields
    /// set in `update` are sent.
    pub async fn save_entry(&self, media_id: i64, update: &EntryUpdate) -> Result<ListEntry> {
        if update.is_empty() {
            return Err(AniListError::InvalidInput("nothing to update".into()));
        }
        let bearer = self.bearer()?;
        let mut variables = Map::new();
        variables.insert("mediaId".into(), json!(media_id));
        if let Some(progress) = update.progress {
            variables.insert("progress".into(), json!(progress.max(0)));
        }
        if let Some(status) = update.status {
            variables.insert("status".into(), json!(status.as_str()));
        }
        if let Some(score) = update.score {
            variables.insert("scoreRaw".into(), json!(score.clamp(0, 100)));
        }
        let query = format!(
            "mutation ($mediaId: Int, $progress: Int, $status: MediaListStatus, $scoreRaw: Int) \
               {{ SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status, \
                  scoreRaw: $scoreRaw) {{ {ENTRY_FIELDS} }} }}"
        );
        let data = self
            .inner
            .http
            .graphql(&query, Value::Object(variables), Some(&bearer), "manga")
            .await?;
        let wire: SaveData = decode(data)?;
        Ok(wire.entry.into_entry())
    }
}

fn decode<T: for<'de> Deserialize<'de>>(data: Value) -> Result<T> {
    serde_json::from_value(data).map_err(AniListError::decode)
}

#[derive(Deserialize)]
struct ViewerData {
    #[serde(rename = "Viewer")]
    viewer: WireViewer,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WireViewer {
    id: i64,
    name: String,
    avatar: Option<WireImage>,
    site_url: Option<String>,
}

#[derive(Deserialize)]
struct WireImage {
    medium: Option<String>,
    large: Option<String>,
}

#[derive(Deserialize)]
struct PageData {
    #[serde(rename = "Page")]
    page: WirePage,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WirePage {
    page_info: WirePageInfo,
    #[serde(default)]
    media: Vec<WireMedia>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WirePageInfo {
    #[serde(default)]
    has_next_page: bool,
}

#[derive(Deserialize)]
struct MediaData {
    #[serde(rename = "Media")]
    media: Option<WireMedia>,
}

#[derive(Deserialize)]
struct SaveData {
    #[serde(rename = "SaveMediaListEntry")]
    entry: WireEntry,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WireMedia {
    id: i64,
    #[serde(default)]
    title: Option<MediaTitle>,
    #[serde(default)]
    synonyms: Option<Vec<String>>,
    format: Option<String>,
    status: Option<String>,
    chapters: Option<i64>,
    volumes: Option<i64>,
    start_date: Option<WireDate>,
    cover_image: Option<WireImage>,
    site_url: Option<String>,
    #[serde(default)]
    is_adult: Option<bool>,
    media_list_entry: Option<WireEntry>,
}

#[derive(Deserialize)]
struct WireDate {
    year: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WireEntry {
    id: i64,
    status: Option<String>,
    progress: Option<i64>,
    score: Option<f64>,
    repeat: Option<i64>,
    updated_at: Option<i64>,
}

impl WireMedia {
    fn into_media(self) -> Media {
        Media {
            id: self.id,
            title: self.title.unwrap_or_default(),
            synonyms: self.synonyms.unwrap_or_default(),
            format: self.format,
            status: self.status,
            chapters: self.chapters,
            volumes: self.volumes,
            start_year: self.start_date.and_then(|d| d.year),
            cover: self.cover_image.and_then(|c| c.large.or(c.medium)),
            site_url: self.site_url,
            is_adult: self.is_adult.unwrap_or(false),
            list_entry: self.media_list_entry.map(WireEntry::into_entry),
        }
    }
}

impl WireEntry {
    fn into_entry(self) -> ListEntry {
        ListEntry {
            id: self.id,
            status: self.status.as_deref().and_then(ListStatus::parse),
            progress: self.progress.unwrap_or(0),
            score: self.score.unwrap_or(0.0),
            repeat: self.repeat.unwrap_or(0),
            updated_at: self.updated_at,
        }
    }
}
