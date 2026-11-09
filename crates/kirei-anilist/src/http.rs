//! The one place requests leave the process: the rate limit, retries with
//! backoff, and the mapping of HTTP and GraphQL failures to errors.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use reqwest::StatusCode;
use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE, HeaderMap, RETRY_AFTER};
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::time::{Instant, sleep};

use crate::config::{ClientConfig, RetryPolicy};
use crate::error::{AniListError, Result};
use crate::limiter::RateLimiter;
use crate::token::Secret;

#[derive(Debug)]
pub(crate) struct Http {
    client: reqwest::Client,
    endpoint: url::Url,
    pub(crate) limiter: RateLimiter,
    retry: RetryPolicy,
}

#[derive(Debug, Deserialize)]
struct Envelope {
    data: Option<Value>,
    #[serde(default)]
    errors: Vec<GraphQlError>,
}

#[derive(Debug, Deserialize)]
struct GraphQlError {
    #[serde(default)]
    message: String,
    status: Option<u16>,
}

impl Http {
    pub(crate) fn new(config: &ClientConfig) -> Result<Self> {
        // reqwest is built without a bundled crypto provider; install ring as
        // the process default. An error only means one is installed already.
        let _ = rustls::crypto::ring::default_provider().install_default();
        let client = reqwest::Client::builder()
            .user_agent(config.user_agent.trim())
            .https_only(config.endpoints.https_only())
            .timeout(config.request_timeout)
            .connect_timeout(Duration::from_secs(10))
            .build()
            .map_err(AniListError::network)?;
        let limits = config.limits;
        Ok(Self {
            client,
            endpoint: config.endpoints.graphql.clone(),
            limiter: RateLimiter::new(
                limits.per_minute,
                limits.ceiling,
                Duration::from_secs(60),
                limits.min_gap,
            ),
            retry: config.retry,
        })
    }

    /// Sends one GraphQL operation and returns its `data`. `what` names the
    /// thing a 404 means, for the error message.
    pub(crate) async fn graphql(
        &self,
        query: &str,
        variables: Value,
        bearer: Option<&Secret>,
        what: &'static str,
    ) -> Result<Value> {
        let body = serde_json::to_vec(&json!({ "query": query, "variables": variables }))
            .map_err(AniListError::decode)?;
        let mut attempt = 0;
        loop {
            self.limiter.acquire().await;
            let mut request = self
                .client
                .post(self.endpoint.clone())
                .header(CONTENT_TYPE, "application/json")
                .header(ACCEPT, "application/json")
                .body(body.clone());
            if let Some(token) = bearer {
                request = request.header(AUTHORIZATION, format!("Bearer {}", token.expose()));
            }
            let retries_left = attempt < self.retry.max_retries;
            let response = match request.send().await {
                Ok(response) => response,
                Err(error) if retries_left && is_transient(&error) => {
                    sleep(self.backoff(attempt)).await;
                    attempt += 1;
                    continue;
                }
                Err(error) => return Err(AniListError::network(error)),
            };

            let status = response.status();
            let headers = response.headers().clone();
            self.follow_limit_headers(&headers).await;

            if status == StatusCode::TOO_MANY_REQUESTS {
                let wait = retry_wait(&headers).unwrap_or_else(|| self.backoff(attempt));
                // The timeout covers the whole client, so hold every request.
                self.limiter.pause_until(Instant::now() + wait).await;
                if retries_left && wait <= self.retry.max_delay {
                    attempt += 1;
                    continue;
                }
                return Err(AniListError::RateLimited { retry_after: wait });
            }
            if status.is_server_error() && retries_left {
                let wait = retry_wait(&headers)
                    .unwrap_or_else(|| self.backoff(attempt))
                    .min(self.retry.max_delay);
                sleep(wait).await;
                attempt += 1;
                continue;
            }

            let bytes = response.bytes().await.map_err(AniListError::network)?;
            let envelope: Option<Envelope> = serde_json::from_slice(&bytes).ok();
            return match envelope {
                Some(envelope) if envelope.errors.is_empty() && status.is_success() => {
                    envelope.data.ok_or_else(|| AniListError::decode("no data"))
                }
                Some(envelope) => Err(map_error(
                    status,
                    envelope.errors.into_iter().next(),
                    bearer.is_some(),
                    what,
                )),
                None if status.is_success() => Err(AniListError::decode("body is not JSON")),
                None => Err(map_error(status, None, bearer.is_some(), what)),
            };
        }
    }

    /// Follows `X-RateLimit-Limit`, and pauses until `X-RateLimit-Reset`
    /// when AniList says nothing is left.
    async fn follow_limit_headers(&self, headers: &HeaderMap) {
        if let Some(limit) = header_u64(headers, "x-ratelimit-limit") {
            self.limiter
                .set_max(u32::try_from(limit).unwrap_or(u32::MAX))
                .await;
        }
        if header_u64(headers, "x-ratelimit-remaining") == Some(0)
            && let Some(wait) = reset_wait(headers)
        {
            self.limiter.pause_until(Instant::now() + wait).await;
        }
    }

    fn backoff(&self, attempt: u32) -> Duration {
        let exponential = self
            .retry
            .base_delay
            .saturating_mul(1u32 << attempt.min(16))
            .min(self.retry.max_delay);
        // Half fixed, half jitter.
        let half = exponential / 2;
        half + half.mul_f64(jitter())
    }
}

fn map_error(
    status: StatusCode,
    error: Option<GraphQlError>,
    sent_token: bool,
    what: &'static str,
) -> AniListError {
    let code = error
        .as_ref()
        .and_then(|e| e.status)
        .unwrap_or(status.as_u16());
    let message = error
        .map(|e| e.message)
        .filter(|m| !m.trim().is_empty())
        .unwrap_or_else(|| status.canonical_reason().unwrap_or("error").to_owned());
    let lower = message.to_lowercase();
    if lower.contains("temporarily disabled") {
        return AniListError::Unavailable(message);
    }
    if code == 401 || lower.contains("invalid token") || lower.contains("unauthorized") {
        return if sent_token {
            AniListError::TokenRejected
        } else {
            AniListError::NotSignedIn
        };
    }
    if code == 404 {
        return AniListError::NotFound(what);
    }
    AniListError::Api {
        status: code,
        message,
    }
}

fn is_transient(error: &reqwest::Error) -> bool {
    error.is_timeout() || error.is_connect() || error.is_request()
}

fn header_u64(headers: &HeaderMap, name: &str) -> Option<u64> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.trim().parse().ok())
}

/// Time until `X-RateLimit-Reset`, a Unix timestamp; at least a second.
fn reset_wait(headers: &HeaderMap) -> Option<Duration> {
    let until = header_u64(headers, "x-ratelimit-reset")?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0);
    Some(Duration::from_secs(until.saturating_sub(now).max(1)))
}

/// How long a 429 asked us to wait: `Retry-After` in seconds, else
/// `X-RateLimit-Reset`.
fn retry_wait(headers: &HeaderMap) -> Option<Duration> {
    header_u64(headers, RETRY_AFTER.as_str())
        .map(Duration::from_secs)
        .or_else(|| reset_wait(headers))
}

/// A number in [0, 1) that differs between calls. Not for anything that
/// needs real randomness.
fn jitter() -> f64 {
    use std::sync::atomic::{AtomicU64, Ordering};
    static STATE: AtomicU64 = AtomicU64::new(0);
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| u64::from(elapsed.subsec_nanos()))
        .unwrap_or(0);
    let mut x = STATE.fetch_add(0x9E37_79B9_7F4A_7C15, Ordering::Relaxed) ^ seed;
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
    fn retry_after_wins_over_the_reset_time() {
        let mut headers = HeaderMap::new();
        let soon = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
            + 40;
        headers.insert(
            "x-ratelimit-reset",
            HeaderValue::from_str(&soon.to_string()).unwrap(),
        );
        let wait = retry_wait(&headers).unwrap();
        assert!(wait <= Duration::from_secs(40) && wait >= Duration::from_secs(38));
        headers.insert(RETRY_AFTER, HeaderValue::from_static("7"));
        assert_eq!(retry_wait(&headers), Some(Duration::from_secs(7)));
    }

    #[test]
    fn errors_map_to_what_the_app_acts_on() {
        let err = |status: u16, message: &str| {
            Some(GraphQlError {
                message: message.into(),
                status: Some(status),
            })
        };
        assert!(matches!(
            map_error(
                StatusCode::BAD_REQUEST,
                err(400, "Invalid token"),
                true,
                "x"
            ),
            AniListError::TokenRejected
        ));
        assert!(matches!(
            map_error(
                StatusCode::UNAUTHORIZED,
                err(401, "Unauthorized."),
                false,
                "x"
            ),
            AniListError::NotSignedIn
        ));
        assert!(matches!(
            map_error(StatusCode::NOT_FOUND, err(404, "Not Found."), true, "manga"),
            AniListError::NotFound("manga")
        ));
        assert!(matches!(
            map_error(
                StatusCode::FORBIDDEN,
                err(403, "The AniList API has been temporarily disabled."),
                true,
                "x"
            ),
            AniListError::Unavailable(_)
        ));
        assert!(matches!(
            map_error(
                StatusCode::BAD_REQUEST,
                err(400, "Validation error"),
                true,
                "x"
            ),
            AniListError::Api { status: 400, .. }
        ));
    }

    #[test]
    fn jitter_stays_in_range() {
        for _ in 0..1000 {
            assert!((0.0..1.0).contains(&jitter()));
        }
    }
}
