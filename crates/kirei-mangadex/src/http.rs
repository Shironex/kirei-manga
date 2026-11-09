//! One place where requests leave the process: rate limits, retries with
//! backoff, the response cache, and the mapping of HTTP failures to errors.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use bytes::Bytes;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE, HeaderMap, RETRY_AFTER};
use reqwest::{Method, StatusCode};
use tokio::time::{Instant, sleep};
use url::Url;

use crate::auth::Secret;
use crate::cache::ResponseCache;
use crate::config::{ClientConfig, Limits, RetryPolicy};
use crate::error::{MangaDexError, Result};
use crate::limiter::RateLimiter;
use crate::wire::ErrorBody;

/// Which per-endpoint budget a request also counts against, on top of the
/// global one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Bucket {
    Global,
    AtHome,
    SignIn,
    Refresh,
}

pub(crate) enum Body {
    Json(Vec<u8>),
    Form(String),
}

pub(crate) struct Request {
    pub(crate) method: Method,
    pub(crate) url: Url,
    pub(crate) bucket: Bucket,
    pub(crate) bearer: Option<Secret>,
    pub(crate) body: Option<Body>,
    /// Cache the body for this long. Ignored for requests with a bearer.
    pub(crate) cache_ttl: Option<Duration>,
    /// What a 404 means for the caller, for the error message.
    pub(crate) what: &'static str,
}

impl Request {
    pub(crate) fn get(url: Url, what: &'static str) -> Self {
        Self {
            method: Method::GET,
            url,
            bucket: Bucket::Global,
            bearer: None,
            body: None,
            cache_ttl: None,
            what,
        }
    }

    pub(crate) fn cached(mut self, ttl: Duration) -> Self {
        self.cache_ttl = Some(ttl);
        self
    }

    pub(crate) fn bucket(mut self, bucket: Bucket) -> Self {
        self.bucket = bucket;
        self
    }
}

/// A failed request, before the auth layer decides what a 401 means.
#[derive(Debug)]
pub(crate) enum Failure {
    Unauthorized(Bytes),
    /// The token endpoint answers 400 for a refused grant.
    BadRequest(Bytes),
    Other(MangaDexError),
}

impl From<MangaDexError> for Failure {
    fn from(error: MangaDexError) -> Self {
        Self::Other(error)
    }
}

impl Failure {
    pub(crate) fn into_error(self, what: &'static str) -> MangaDexError {
        match self {
            Self::Unauthorized(_) => MangaDexError::NotSignedIn,
            Self::BadRequest(body) => MangaDexError::Api {
                status: 400,
                message: ErrorBody::message(&body).unwrap_or_else(|| format!("bad {what} request")),
            },
            Self::Other(error) => error,
        }
    }
}

/// A raw image download, for the at-home reports.
pub(crate) struct ImageResponse {
    pub(crate) status: StatusCode,
    pub(crate) cache_hit: bool,
    pub(crate) content_type: Option<String>,
    pub(crate) body: std::result::Result<Bytes, reqwest::Error>,
}

#[derive(Debug)]
pub(crate) struct Http {
    client: reqwest::Client,
    images: reqwest::Client,
    global: RateLimiter,
    at_home: RateLimiter,
    sign_in: RateLimiter,
    refresh: RateLimiter,
    uploads: RateLimiter,
    limits: Limits,
    retry: RetryPolicy,
    pub(crate) cache: ResponseCache,
}

impl Http {
    pub(crate) fn new(config: &ClientConfig) -> Result<Self> {
        // reqwest is built without a bundled crypto provider (the updater
        // makes the same choice), so install ring as the process default.
        // An error only means a provider is installed already.
        let _ = rustls::crypto::ring::default_provider().install_default();
        let https_only = config.endpoints.https_only();
        let build = |timeout: Duration| {
            reqwest::Client::builder()
                .user_agent(config.user_agent.trim())
                .https_only(https_only)
                .timeout(timeout)
                .connect_timeout(Duration::from_secs(10))
                .build()
                .map_err(MangaDexError::network)
        };
        let limits = config.limits;
        Ok(Self {
            client: build(config.request_timeout)?,
            images: build(config.image_timeout)?,
            global: RateLimiter::new(limits.global),
            at_home: RateLimiter::new(limits.at_home),
            sign_in: RateLimiter::new(limits.sign_in),
            refresh: RateLimiter::new(limits.refresh),
            uploads: RateLimiter::new(limits.uploads),
            limits,
            retry: config.retry,
            cache: ResponseCache::new(config.cache.max_entries),
        })
    }

    async fn acquire(&self, bucket: Bucket) {
        // The narrower budget first, so a request waiting for its endpoint
        // slot does not sit on a global slot meanwhile.
        match bucket {
            Bucket::Global => {}
            Bucket::AtHome => self.at_home.acquire().await,
            Bucket::SignIn => self.sign_in.acquire().await,
            Bucket::Refresh => self.refresh.acquire().await,
        }
        self.global.acquire().await;
    }

    /// Sends an API request with rate limiting and retries, and returns the
    /// body of a 2xx answer.
    pub(crate) async fn send(&self, request: Request) -> std::result::Result<Bytes, Failure> {
        let cache_key = match (request.cache_ttl, &request.bearer) {
            (Some(_), None) => Some(request.url.as_str().to_string()),
            _ => None,
        };
        if let Some(body) = cache_key.as_deref().and_then(|key| self.cache.get(key)) {
            return Ok(body);
        }

        let mut attempt = 0;
        loop {
            self.acquire(request.bucket).await;
            let response = self.build(&request).send().await;
            let retries_left = attempt < self.retry.max_retries;
            let response = match response {
                Ok(response) => response,
                Err(error) if retries_left && is_transient(&error) => {
                    sleep(self.backoff(attempt)).await;
                    attempt += 1;
                    continue;
                }
                Err(error) => return Err(MangaDexError::network(error).into()),
            };

            let status = response.status();
            let headers = response.headers().clone();
            if status == StatusCode::TOO_MANY_REQUESTS {
                let wait = retry_wait(&headers).unwrap_or_else(|| self.backoff(attempt));
                // A 429 covers every request from this IP, so hold them all.
                self.global.pause_until(Instant::now() + wait).await;
                if retries_left && wait <= self.retry.max_delay {
                    attempt += 1;
                    continue;
                }
                return Err(MangaDexError::RateLimited { retry_after: wait }.into());
            }
            if status.is_server_error() && retries_left {
                let wait = retry_wait(&headers)
                    .unwrap_or_else(|| self.backoff(attempt))
                    .min(self.retry.max_delay);
                sleep(wait).await;
                attempt += 1;
                continue;
            }

            let body = response.bytes().await.map_err(MangaDexError::network)?;
            if status.is_success() {
                if let (Some(key), Some(ttl)) = (cache_key, request.cache_ttl) {
                    self.cache.put(key, body.clone(), ttl);
                }
                return Ok(body);
            }
            return Err(self.failure(status, body, request.what).await);
        }
    }

    async fn failure(&self, status: StatusCode, body: Bytes, what: &'static str) -> Failure {
        match status {
            StatusCode::UNAUTHORIZED => Failure::Unauthorized(body),
            StatusCode::BAD_REQUEST => Failure::BadRequest(body),
            StatusCode::NOT_FOUND => MangaDexError::NotFound(what).into(),
            StatusCode::FORBIDDEN => match ErrorBody::message(&body) {
                Some(message) => MangaDexError::Api {
                    status: 403,
                    message,
                }
                .into(),
                None => {
                    // No API error body: the DDoS protection, not the API.
                    // Every request sent now would extend the ban.
                    self.global
                        .pause_until(Instant::now() + self.limits.ban_cooldown)
                        .await;
                    MangaDexError::Blocked.into()
                }
            },
            _ => MangaDexError::Api {
                status: status.as_u16(),
                message: ErrorBody::message(&body)
                    .unwrap_or_else(|| status.canonical_reason().unwrap_or("error").into()),
            }
            .into(),
        }
    }

    fn build(&self, request: &Request) -> reqwest::RequestBuilder {
        let mut builder = self
            .client
            .request(request.method.clone(), request.url.clone());
        if let Some(token) = &request.bearer {
            builder = builder.header(AUTHORIZATION, format!("Bearer {}", token.expose()));
        }
        match &request.body {
            Some(Body::Json(json)) => {
                builder = builder
                    .header(CONTENT_TYPE, "application/json")
                    .body(json.clone());
            }
            Some(Body::Form(form)) => {
                builder = builder
                    .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
                    .body(form.clone());
            }
            None => {}
        }
        builder
    }

    /// Downloads an image from a MangaDex@Home server: no auth header, no
    /// retries (failover is the caller's job) and no API budget.
    pub(crate) async fn image(
        &self,
        url: &str,
    ) -> std::result::Result<ImageResponse, reqwest::Error> {
        let response = self.images.get(url).send().await?;
        let status = response.status();
        let cache_hit = response
            .headers()
            .get("x-cache")
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.starts_with("HIT"));
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        let body = if status.is_success() {
            response.bytes().await
        } else {
            Ok(Bytes::new())
        };
        Ok(ImageResponse {
            status,
            cache_hit,
            content_type,
            body,
        })
    }

    /// Downloads a cover from uploads.mangadex.org under its own budget.
    pub(crate) async fn cover(&self, url: Url) -> Result<Bytes> {
        self.uploads.acquire().await;
        let response = self
            .images
            .get(url)
            .send()
            .await
            .map_err(MangaDexError::network)?;
        let status = response.status();
        if status == StatusCode::NOT_FOUND {
            return Err(MangaDexError::NotFound("cover"));
        }
        if !status.is_success() {
            return Err(MangaDexError::Api {
                status: status.as_u16(),
                message: "cover download failed".into(),
            });
        }
        response.bytes().await.map_err(MangaDexError::network)
    }

    /// Fire and forget: posts a MangaDex@Home report. Failures are ignored;
    /// a lost report must never fail a page.
    pub(crate) async fn report(&self, url: Url, json: Vec<u8>) {
        let _ = self
            .client
            .post(url)
            .header(CONTENT_TYPE, "application/json")
            .timeout(Duration::from_secs(10))
            .body(json)
            .send()
            .await;
    }

    fn backoff(&self, attempt: u32) -> Duration {
        let exponential = self
            .retry
            .base_delay
            .saturating_mul(1u32 << attempt.min(16))
            .min(self.retry.max_delay);
        // Half fixed, half jitter, so clients that failed together do not
        // retry together.
        let half = exponential / 2;
        half + half.mul_f64(jitter())
    }
}

fn is_transient(error: &reqwest::Error) -> bool {
    error.is_timeout() || error.is_connect() || error.is_request()
}

/// How long the server asked us to wait: MangaDex's
/// `X-RateLimit-Retry-After` (a Unix timestamp) or a standard `Retry-After`
/// in seconds.
fn retry_wait(headers: &HeaderMap) -> Option<Duration> {
    let header = |name: &str| {
        headers
            .get(name)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.trim().parse::<u64>().ok())
    };
    if let Some(until) = header("x-ratelimit-retry-after") {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|elapsed| elapsed.as_secs())
            .unwrap_or(0);
        // At least a second: the window ends at a whole-second timestamp.
        return Some(Duration::from_secs(until.saturating_sub(now).max(1)));
    }
    header(RETRY_AFTER.as_str()).map(Duration::from_secs)
}

/// A number in [0, 1) that differs between calls. Not for anything that
/// needs real randomness.
fn jitter() -> f64 {
    use std::sync::atomic::{AtomicU64, Ordering};
    static STATE: AtomicU64 = AtomicU64::new(0);
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.subsec_nanos() as u64)
        .unwrap_or(0);
    let mut x = STATE.fetch_add(0x9E37_79B9_7F4A_7C15, Ordering::Relaxed) ^ seed;
    // splitmix64 finalizer.
    x = (x ^ (x >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    x ^= x >> 31;
    (x >> 11) as f64 / (1u64 << 53) as f64
}

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::header::HeaderValue;

    #[test]
    fn reads_both_retry_headers() {
        let mut headers = HeaderMap::new();
        headers.insert(RETRY_AFTER, HeaderValue::from_static("7"));
        assert_eq!(retry_wait(&headers), Some(Duration::from_secs(7)));

        let soon = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
            + 20;
        headers.insert(
            "x-ratelimit-retry-after",
            HeaderValue::from_str(&soon.to_string()).unwrap(),
        );
        let wait = retry_wait(&headers).unwrap();
        assert!(wait <= Duration::from_secs(20) && wait >= Duration::from_secs(18));
    }

    #[test]
    fn jitter_stays_in_range() {
        for _ in 0..1000 {
            let value = jitter();
            assert!((0.0..1.0).contains(&value));
        }
    }
}
