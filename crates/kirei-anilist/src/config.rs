//! Where requests go and how fast.

use std::time::Duration;

use url::Url;

use crate::error::{AniListError, Result};

/// The User-Agent KireiManga sends to AniList.
pub fn default_user_agent(app_version: &str) -> String {
    format!("KireiManga/{app_version} (+https://github.com/Shironex/kirei-manga)")
}

/// Base URLs of the AniList services the client talks to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Endpoints {
    /// `https://graphql.anilist.co`, the only API endpoint. Every request is a
    /// POST.
    pub graphql: Url,
    /// The OAuth authorize page the browser is sent to.
    pub authorize: Url,
}

impl Endpoints {
    pub fn production() -> Self {
        Self {
            graphql: fixed_url("https://graphql.anilist.co/"),
            authorize: fixed_url("https://anilist.co/api/v2/oauth/authorize"),
        }
    }

    /// Both endpoints under one base URL, for tests against a local server:
    /// GraphQL at `/graphql`, the authorize page at `/oauth/authorize`.
    pub fn local(base: &str) -> Result<Self> {
        let base = Url::parse(base)
            .map_err(|error| AniListError::InvalidInput(format!("bad base URL: {error}")))?;
        let join = |path: &str| {
            base.join(path)
                .map_err(|error| AniListError::InvalidInput(format!("bad base URL: {error}")))
        };
        Ok(Self {
            graphql: join("/graphql")?,
            authorize: join("/oauth/authorize")?,
        })
    }

    pub(crate) fn https_only(&self) -> bool {
        self.graphql.scheme() == "https"
    }
}

fn fixed_url(text: &str) -> Url {
    Url::parse(text).unwrap_or_else(|_| unreachable!("constant URL {text} parses"))
}

/// The request budget. The defaults follow docs.anilist.co/guide/rate-limiting
/// (checked 2026-11-09): 90 requests a minute normally, 30 while the API runs
/// in its degraded mode, plus an unpublished burst limiter. The client starts
/// at the degraded figure and follows `X-RateLimit-Limit` from there, never
/// above `ceiling`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Limits {
    /// Requests per minute until AniList reports its own figure.
    pub per_minute: u32,
    /// The most the client will send per minute, whatever AniList reports.
    pub ceiling: u32,
    /// Least time between two request starts, against the burst limiter.
    pub min_gap: Duration,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            per_minute: 30,
            ceiling: 90,
            min_gap: Duration::from_millis(500),
        }
    }
}

/// How failed requests are retried.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RetryPolicy {
    /// Retries after the first attempt, for 429, 5xx and connection failures.
    pub max_retries: u32,
    /// First backoff; doubles per attempt.
    pub base_delay: Duration,
    /// The longest wait the client sleeps through. A 429 asking for more is
    /// returned as [`AniListError::RateLimited`] instead.
    pub max_delay: Duration,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            max_retries: 3,
            base_delay: Duration::from_millis(500),
            // AniList's timeout after a 429 is one minute.
            max_delay: Duration::from_secs(65),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ClientConfig {
    pub endpoints: Endpoints,
    pub user_agent: String,
    pub limits: Limits,
    pub retry: RetryPolicy,
    pub request_timeout: Duration,
}

impl ClientConfig {
    pub fn new(user_agent: impl Into<String>) -> Self {
        Self {
            endpoints: Endpoints::production(),
            user_agent: user_agent.into(),
            limits: Limits::default(),
            retry: RetryPolicy::default(),
            request_timeout: Duration::from_secs(20),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn production_urls_parse() {
        let endpoints = Endpoints::production();
        assert_eq!(endpoints.graphql.as_str(), "https://graphql.anilist.co/");
        assert!(endpoints.https_only());
    }

    #[test]
    fn local_endpoints_share_one_base() {
        let endpoints = Endpoints::local("http://127.0.0.1:9000").unwrap();
        assert_eq!(endpoints.graphql.as_str(), "http://127.0.0.1:9000/graphql");
        assert!(!endpoints.https_only());
    }
}
