//! Client configuration: where to send requests, how fast, and with which
//! defaults for languages and content ratings.

use std::sync::Arc;
use std::time::Duration;

use url::Url;

use crate::auth::TokenSink;
use crate::error::{MangaDexError, Result};
use crate::language::LanguagePrefs;
use crate::limiter::RateWindow;
use crate::model::ContentRating;

/// The User-Agent KireiManga sends. MangaDex requires a real, unspoofed
/// User-Agent on every request.
pub fn default_user_agent(app_version: &str) -> String {
    format!("KireiManga/{app_version} (+https://github.com/Shironex/kirei-manga)")
}

/// Base URLs of the services the client talks to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Endpoints {
    /// The REST API, `https://api.mangadex.org`.
    pub api: Url,
    /// The OAuth token endpoint of the MangaDex identity server.
    pub token: Url,
    /// Where MangaDex@Home image loads are reported.
    pub report: Url,
    /// Cover art, `https://uploads.mangadex.org`.
    pub uploads: Url,
}

impl Endpoints {
    pub fn production() -> Self {
        Self {
            api: fixed_url("https://api.mangadex.org/"),
            token: fixed_url(
                "https://auth.mangadex.org/realms/mangadex/protocol/openid-connect/token",
            ),
            report: fixed_url("https://api.mangadex.network/report"),
            uploads: fixed_url("https://uploads.mangadex.org/"),
        }
    }

    /// Every service under one base URL, for tests against a local server:
    /// the API at the root, the token endpoint at `/auth/token`, reports at
    /// `/report` and covers under `/uploads/`.
    pub fn local(base: &str) -> Result<Self> {
        let base = Url::parse(base)
            .map_err(|error| MangaDexError::InvalidInput(format!("bad base URL: {error}")))?;
        let join = |path: &str| {
            base.join(path)
                .map_err(|error| MangaDexError::InvalidInput(format!("bad base URL: {error}")))
        };
        Ok(Self {
            api: join("/")?,
            token: join("/auth/token")?,
            report: join("/report")?,
            uploads: join("/uploads/")?,
        })
    }

    pub(crate) fn https_only(&self) -> bool {
        [&self.api, &self.token, &self.report, &self.uploads]
            .iter()
            .all(|url| url.scheme() == "https")
    }
}

fn fixed_url(text: &str) -> Url {
    // The production URLs are constants; a typo is caught by the tests.
    Url::parse(text).unwrap_or_else(|_| unreachable!("constant URL {text} parses"))
}

/// The request budgets the client enforces. The defaults are MangaDex's
/// documented limits (api.mangadex.org/docs/2-limitations), see
/// `docs/mangadex.md`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Limits {
    /// Every request to the API and the token endpoint: about 5 per second
    /// per IP.
    pub global: RateWindow,
    /// `GET /at-home/server/{id}`: 40 per minute.
    pub at_home: RateWindow,
    /// Password sign ins. MangaDex documents 30 per hour for `/auth/login`;
    /// the same budget guards the OAuth password grant.
    pub sign_in: RateWindow,
    /// Token refreshes. MangaDex documents 60 per hour for `/auth/refresh`;
    /// the same budget guards the OAuth refresh grant.
    pub refresh: RateWindow,
    /// Cover downloads from uploads.mangadex.org. MangaDex publishes no
    /// number for it; this is our own guard so a grid of covers cannot
    /// burst.
    pub uploads: RateWindow,
    /// How long to hold every request after MangaDex answers 403 without an
    /// API error, the sign of a temporary ban. Its length is not documented
    /// and each request sent during a ban extends it, so stay quiet.
    pub ban_cooldown: Duration,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            global: RateWindow::per_second(5),
            at_home: RateWindow::per_minute(40),
            sign_in: RateWindow::per_hour(30),
            refresh: RateWindow::per_hour(60),
            uploads: RateWindow::per_second(10),
            ban_cooldown: Duration::from_secs(5 * 60),
        }
    }
}

/// Retries for 429, 5xx and connection failures.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RetryPolicy {
    /// Retries after the first attempt.
    pub max_retries: u32,
    /// First backoff; doubles on each retry, with jitter.
    pub base_delay: Duration,
    /// Longest single wait. A 429 asking for longer than this is returned as
    /// [`MangaDexError::RateLimited`] instead of slept through.
    pub max_delay: Duration,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            max_retries: 3,
            base_delay: Duration::from_millis(500),
            max_delay: Duration::from_secs(30),
        }
    }
}

/// How long hot public reads stay in memory.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CacheConfig {
    /// Search results and chapter lists.
    pub lists: Duration,
    /// Manga and chapter details.
    pub details: Duration,
    /// The tag list, which changes rarely.
    pub tags: Duration,
    /// MangaDex@Home server answers. MangaDex guarantees a base URL for 15
    /// minutes, so reuse it for less than that.
    pub at_home: Duration,
    /// Entries kept at most; the oldest goes first. Zero turns the cache off.
    pub max_entries: usize,
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            lists: Duration::from_secs(5 * 60),
            details: Duration::from_secs(10 * 60),
            tags: Duration::from_secs(24 * 60 * 60),
            at_home: Duration::from_secs(10 * 60),
            max_entries: 512,
        }
    }
}

impl CacheConfig {
    /// No caching at all.
    pub fn disabled() -> Self {
        Self {
            max_entries: 0,
            ..Self::default()
        }
    }
}

/// Everything [`crate::MangaDex::new`] needs.
#[derive(Clone)]
pub struct ClientConfig {
    /// Sent on every request. Use [`default_user_agent`].
    pub user_agent: String,
    pub endpoints: Endpoints,
    pub languages: LanguagePrefs,
    /// Ratings to include in searches and chapter lists. Sent explicitly so
    /// results never depend on the server's default.
    pub content_ratings: Vec<ContentRating>,
    /// Ask for MangaDex@Home servers on port 443 only, for networks that
    /// block other ports.
    pub force_port_443: bool,
    pub limits: Limits,
    pub retry: RetryPolicy,
    pub cache: CacheConfig,
    /// Timeout for one API request.
    pub request_timeout: Duration,
    /// Timeout for one image download, body included.
    pub image_timeout: Duration,
    /// Image servers to try for one page before giving up.
    pub image_attempts: u32,
    /// Told whenever the session tokens change, so the app can keep the
    /// refresh token in the OS keychain.
    pub token_sink: Option<Arc<dyn TokenSink>>,
}

impl std::fmt::Debug for ClientConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ClientConfig")
            .field("user_agent", &self.user_agent)
            .field("endpoints", &self.endpoints)
            .field("languages", &self.languages)
            .field("content_ratings", &self.content_ratings)
            .field("force_port_443", &self.force_port_443)
            .field("limits", &self.limits)
            .field("retry", &self.retry)
            .field("cache", &self.cache)
            .field("token_sink", &self.token_sink.is_some())
            .finish_non_exhaustive()
    }
}

impl ClientConfig {
    pub fn new(user_agent: impl Into<String>) -> Self {
        Self {
            user_agent: user_agent.into(),
            endpoints: Endpoints::production(),
            languages: LanguagePrefs::default(),
            content_ratings: vec![ContentRating::Safe, ContentRating::Suggestive],
            force_port_443: false,
            limits: Limits::default(),
            retry: RetryPolicy::default(),
            cache: CacheConfig::default(),
            request_timeout: Duration::from_secs(30),
            image_timeout: Duration::from_secs(60),
            image_attempts: 3,
            token_sink: None,
        }
    }

    pub(crate) fn validate(&self) -> Result<()> {
        let agent = self.user_agent.trim();
        if agent.is_empty() || agent.chars().any(char::is_control) {
            return Err(MangaDexError::InvalidInput(
                "MangaDex needs a real User-Agent".into(),
            ));
        }
        if self.content_ratings.is_empty() {
            return Err(MangaDexError::InvalidInput(
                "pick at least one content rating".into(),
            ));
        }
        if self.image_attempts == 0 {
            return Err(MangaDexError::InvalidInput(
                "image_attempts must be at least 1".into(),
            ));
        }
        let limits = self.limits;
        for window in [
            limits.global,
            limits.at_home,
            limits.sign_in,
            limits.refresh,
            limits.uploads,
        ] {
            if window.max == 0 || window.per.is_zero() {
                return Err(MangaDexError::InvalidInput(
                    "every rate window must allow at least one request".into(),
                ));
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn production_endpoints_parse() {
        let endpoints = Endpoints::production();
        assert!(endpoints.https_only());
        assert_eq!(endpoints.api.host_str(), Some("api.mangadex.org"));
        assert_eq!(
            endpoints.report.as_str(),
            "https://api.mangadex.network/report"
        );
    }

    #[test]
    fn rejects_an_empty_user_agent() {
        assert!(ClientConfig::new("  ").validate().is_err());
        assert!(
            ClientConfig::new(default_user_agent("0.3.0"))
                .validate()
                .is_ok()
        );
    }
}
